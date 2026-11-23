#!/usr/bin/env bash
set -euo pipefail
umask 0027

# Runs as the dedicated deployment account. The root-owned restart helper is
# the only privileged command. Database, environment, and upload paths are untouched.
root_input="${1:?deployment root is required}"
release_sha="${2:?release SHA is required}"
archive_digest="${3:?archive digest is required}"
archive_name="${4:?archive name is required}"
local_port="${5:?local application port is required}"
unit=zhongcheng-used-cars.service
restart_helper="${ZC_RESTART_HELPER:-/usr/local/sbin/zhongcheng-restart}"
node_binary="${ZC_NODE_BINARY:-/usr/bin/node}"

[[ "$release_sha" =~ ^[0-9a-f]{40}$ && "$archive_digest" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid release identity' >&2; exit 1; }
[[ "$archive_name" == "zhongcheng-release-$release_sha.tar.gz" ]] || { echo 'Invalid archive name' >&2; exit 1; }
[[ "$root_input" == /* && "$local_port" =~ ^[0-9]{1,5}$ ]] || { echo 'Invalid deployment root or port' >&2; exit 1; }
[[ "$restart_helper" == /* && "$node_binary" == /* ]] || { echo 'Invalid local helper paths' >&2; exit 1; }
(( local_port >= 1 && local_port <= 65535 )) || { echo 'Invalid application port' >&2; exit 1; }

root="$(realpath -e -- "$root_input")"
[[ "$root" == "$root_input" && "$root" != / ]] || { echo 'Deployment root must be a canonical directory' >&2; exit 1; }
[[ -f "$root/.auto-deploy-enabled" && -d "$root/releases" && -d "$root/incoming" && -L "$root/current" ]] || { echo 'Server has not been prepared for automatic deployment' >&2; exit 1; }

exec 9>"$root/.deploy.lock"
flock -n 9 || { echo 'Another deployment is already running' >&2; exit 1; }

previous="$(realpath -e -- "$root/current")"
[[ "$previous" == "$root/releases/"* && -f "$previous/server.js" ]] || { echo 'Current release is not a prepared version directory' >&2; exit 1; }
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 && "$("$node_binary" -p 'process.versions.node.split(".")[0]')" == 24 ]] || { echo 'Release requires Linux x86_64 and Node.js 24' >&2; exit 1; }

# The service must already have been adopted by this release tree. A mismatch
# means restarting it could keep serving the old site or restart another app.
[[ "$(systemctl show -p User "$unit")" == 'User=zhongcheng' ]] || { echo 'Unexpected service account' >&2; exit 1; }
[[ "$(systemctl show -p WorkingDirectory "$unit")" == "WorkingDirectory=$root/current" ]] || { echo 'Service does not run from the current symlink' >&2; exit 1; }
unit_exec="$(systemctl show -p ExecStart "$unit")"
[[ "$unit_exec" == *'argv[]=/usr/bin/node server.js'* ]] || { echo 'Unexpected systemd start command' >&2; exit 1; }
systemctl is-active --quiet "$unit" || { echo 'Existing website service is not active' >&2; exit 1; }

runtime_group="$(id -gn zhongcheng)"
[[ "$(stat -c %G "$root/releases")" == "$runtime_group" ]] || { echo 'Release directory is not shared with the runtime group' >&2; exit 1; }
[[ "$(stat -c %a "$root/releases")" == 2750 ]] || { echo 'Release directory must have mode 2750' >&2; exit 1; }
[[ -x "$restart_helper" ]] || { echo 'Root-owned restart helper is unavailable' >&2; exit 1; }
sudo -n -l "$restart_helper" >/dev/null || { echo 'Deployment account cannot run the fixed restart helper' >&2; exit 1; }
command -v curl >/dev/null

archive="$root/incoming/$archive_name"
[[ -f "$archive" && ! -L "$archive" ]] || { echo 'Uploaded release archive is missing' >&2; exit 1; }
printf '%s  %s\n' "$archive_digest" "$archive" | sha256sum -c - >/dev/null

release="$root/releases/$release_sha"
if [[ -e "$release" ]]; then
  [[ -d "$release" && ! -L "$release" && -f "$release/.archive-sha256" && "$(cat "$release/.archive-sha256")" == "$archive_digest" ]] || { echo 'Existing release does not match artifact' >&2; exit 1; }
else
  staging="$root/releases/.staging-$release_sha-$$"
  mkdir -m 2750 -- "$staging"
  [[ "$(stat -c %G "$staging")" == "$runtime_group" ]] || { echo 'Staging directory has the wrong group' >&2; exit 1; }
  tar -xzf "$archive" -C "$staging" --no-same-owner --no-same-permissions
  [[ -f "$staging/server.js" && -d "$staging/.next/static" && -d "$staging/public" ]] || { echo 'Incomplete standalone release' >&2; exit 1; }
  chmod g+s "$staging/.next"
  install -d -m 2770 "$staging/.next/cache"
  [[ "$(stat -c %G "$staging/.next/cache")" == "$runtime_group" ]] || { echo 'Cache directory has the wrong group' >&2; exit 1; }
  printf '%s\n' "$archive_digest" > "$staging/.archive-sha256"
  printf '%s\n' "$release_sha" > "$staging/.release-sha"
  mv -- "$staging" "$release"
fi

health() {
  local expected="$1" response attempt
  for attempt in {1..12}; do
    if response="$(curl -fsS --max-time 5 "http://127.0.0.1:$local_port/api/health" 2>/dev/null)" && \
      EXPECTED_RELEASE="$expected" "$node_binary" -e '
        let body = "";
        process.stdin.on("data", (chunk) => body += chunk);
        process.stdin.on("end", () => {
          const health = JSON.parse(body);
          if (health.ok !== true || health.release !== process.env.EXPECTED_RELEASE) process.exit(1);
        });
      ' <<< "$response"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

old_sha="$(basename "$previous")"
next_link="$root/.current-next-$$"
ln -s -- "$release" "$next_link"
mv -Tf -- "$next_link" "$root/current"

if sudo -n "$restart_helper" && health "$release_sha"; then
  echo "Deployment healthy: $release_sha"
  exit 0
fi

echo "Health check failed for $release_sha; restoring $old_sha" >&2
rollback_link="$root/.current-rollback-$$"
ln -s -- "$previous" "$rollback_link"
mv -Tf -- "$rollback_link" "$root/current"
if sudo -n "$restart_helper" && health "$old_sha"; then
  echo "Previous release restored and healthy: $old_sha" >&2
elif curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:$local_port/"; then
  echo 'Previous release is reachable; version-aware health was unavailable' >&2
else
  echo 'Rollback could not be verified. Inspect journalctl and the current symlink on the server.' >&2
fi
exit 1
