#!/usr/bin/env bash
set -euo pipefail

# Runs on the server as the dedicated deployment user. It never runs SQL migrations.
root_input="${1:?deployment root is required}"
env_file="${2:?environment file is required}"
app_name="${3:?PM2 application name is required}"
release_sha="${4:?release SHA is required}"
archive_digest="${5:?archive digest is required}"
archive_name="${6:?archive name is required}"
expected_site_url="${7:?site URL is required}"

[[ "$release_sha" =~ ^[0-9a-f]{40}$ && "$archive_digest" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid release identity' >&2; exit 1; }
[[ "$archive_name" == "zhongcheng-release-$release_sha.tar.gz" ]] || { echo 'Invalid archive name' >&2; exit 1; }
[[ "$app_name" =~ ^[A-Za-z0-9_-]+$ ]] || { echo 'Invalid PM2 app name' >&2; exit 1; }
[[ "$root_input" == /* && "$env_file" == /* ]] || { echo 'Absolute paths are required' >&2; exit 1; }

root="$(realpath -e -- "$root_input")"
[[ "$root" == "$root_input" && "$root" != / ]] || { echo 'Deployment root must be a canonical directory' >&2; exit 1; }
if command -v systemctl >/dev/null && systemctl is-active --quiet zhongcheng-used-cars 2>/dev/null; then
  echo 'The existing systemd website service is active; refusing to switch a PM2 release' >&2
  exit 1
fi
[[ -f "$root/.auto-deploy-enabled" && -d "$root/releases" && -d "$root/incoming" && -L "$root/current" ]] || { echo 'Server has not been prepared for automatic deployment' >&2; exit 1; }
[[ -r "$env_file" && -f "$env_file" ]] || { echo 'Runtime environment file is unavailable' >&2; exit 1; }

exec 9>"$root/.deploy.lock"
flock -n 9 || { echo 'Another deployment is already running' >&2; exit 1; }

previous="$(realpath -e -- "$root/current")"
[[ "$previous" == "$root/releases/"* && -f "$previous/server.js" ]] || { echo 'Current release is not a prepared version directory' >&2; exit 1; }

set -a
# This file is managed on the server by its administrator and is never uploaded from GitHub.
# shellcheck disable=SC1090
source "$env_file"
set +a

[[ "${NODE_ENV:-}" == production && "${NEXT_PUBLIC_DEMO_MODE:-}" == false ]] || { echo 'Unsafe runtime mode' >&2; exit 1; }
[[ -n "${DATABASE_URL:-}" && "${NEXT_PUBLIC_SITE_URL:-}" == "$expected_site_url" ]] || { echo 'Database or site URL configuration is missing/mismatched' >&2; exit 1; }
[[ "${HOSTNAME:-}" == 127.0.0.1 && "${PORT:-}" =~ ^[0-9]{1,5}$ ]] || { echo 'Expected loopback hostname and numeric port' >&2; exit 1; }
(( PORT >= 1 && PORT <= 65535 )) || { echo 'Invalid application port' >&2; exit 1; }
[[ "${UPLOAD_DIR:-}" == /* && -d "$UPLOAD_DIR" ]] || { echo 'External upload directory is missing' >&2; exit 1; }
upload_root="$(realpath -e -- "$UPLOAD_DIR")"
[[ "$upload_root" != "$root" && "$upload_root" != "$root/"* ]] || { echo 'Uploads cannot live in deployment root' >&2; exit 1; }
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 && "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]] || { echo 'Release requires Linux x86_64 and Node.js 24' >&2; exit 1; }
command -v pm2 >/dev/null
command -v curl >/dev/null

# PM2 must already launch the current symlink. Otherwise reload could keep running old code.
pm2 jlist | PM2_APP_NAME="$app_name" DEPLOY_ROOT="$root" node -e '
  const fs = require("fs");
  const apps = JSON.parse(fs.readFileSync(0, "utf8"));
  const matches = apps.filter((app) => app.name === process.env.PM2_APP_NAME);
  if (matches.length !== 1) throw new Error("Expected exactly one PM2 process");
  const env = matches[0].pm2_env;
  const root = process.env.DEPLOY_ROOT;
  if (env.status !== "online" || env.pm_exec_path !== `${root}/current/server.js` || env.pm_cwd !== `${root}/current`) {
    throw new Error("PM2 does not run current/server.js from the current symlink");
  }
'

archive="$root/incoming/$archive_name"
[[ -f "$archive" && ! -L "$archive" ]] || { echo 'Uploaded release archive is missing' >&2; exit 1; }
printf '%s  %s\n' "$archive_digest" "$archive" | sha256sum -c - >/dev/null

release="$root/releases/$release_sha"
if [[ -e "$release" ]]; then
  [[ -d "$release" && ! -L "$release" && -f "$release/.archive-sha256" && "$(cat "$release/.archive-sha256")" == "$archive_digest" ]] || { echo 'Existing release does not match artifact' >&2; exit 1; }
else
  staging="$root/releases/.staging-$release_sha-$$"
  mkdir -m 0750 -- "$staging"
  tar -xzf "$archive" -C "$staging" --no-same-owner --no-same-permissions
  [[ -f "$staging/server.js" && -d "$staging/.next/static" && -d "$staging/public" ]] || { echo 'Incomplete standalone release' >&2; exit 1; }
  printf '%s\n' "$archive_digest" > "$staging/.archive-sha256"
  mv -- "$staging" "$release"
fi

health() {
  local expected="$1" response attempt
  for attempt in {1..12}; do
    if response="$(curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" 2>/dev/null)" && \
      EXPECTED_RELEASE="$expected" node -e '
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
export ZC_RELEASE_SHA="$release_sha"

if pm2 reload "$app_name" --update-env && health "$release_sha"; then
  echo "Deployment healthy: $release_sha"
  exit 0
fi

echo "Health check failed for $release_sha; restoring $old_sha" >&2
rollback_link="$root/.current-rollback-$$"
ln -s -- "$previous" "$rollback_link"
mv -Tf -- "$rollback_link" "$root/current"
export ZC_RELEASE_SHA="$old_sha"
if pm2 reload "$app_name" --update-env && health "$old_sha"; then
  echo "Previous release restored and healthy: $old_sha" >&2
elif curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo 'Previous release is reachable; version-aware health was unavailable' >&2
else
  echo 'Rollback could not be verified. Inspect PM2 logs and the current symlink on the server.' >&2
fi
exit 1
