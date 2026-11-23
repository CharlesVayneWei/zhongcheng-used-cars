#!/usr/bin/env bash
set -euo pipefail

# Runs on a GitHub-hosted runner. The server never receives the SSH private key.
archive="${1:?release archive is required}"
test -f "$archive"

: "${RELEASE_SHA:?}"
: "${DEPLOY_HOST:?}"
: "${DEPLOY_USER:?}"
: "${DEPLOY_SSH_KEY:?}"
: "${DEPLOY_KNOWN_HOSTS:?}"
: "${DEPLOY_SSH_PORT:?}"
: "${DEPLOY_ROOT:?}"
: "${DEPLOY_ENV_FILE:?}"
: "${DEPLOY_PM2_APP:?}"
: "${PRODUCTION_SITE_URL:?}"

[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid release SHA' >&2; exit 1; }
[[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || { echo 'Invalid SSH host' >&2; exit 1; }
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo 'Invalid SSH user' >&2; exit 1; }
[[ "$DEPLOY_SSH_PORT" =~ ^[0-9]{1,5}$ ]] && (( DEPLOY_SSH_PORT >= 1 && DEPLOY_SSH_PORT <= 65535 )) || { echo 'Invalid SSH port' >&2; exit 1; }
[[ "$DEPLOY_ROOT" =~ ^/[A-Za-z0-9_./-]+$ && "$DEPLOY_ROOT" != *'/../'* && "$DEPLOY_ROOT" != *'/./'* ]] || { echo 'Invalid deployment root' >&2; exit 1; }
[[ "$DEPLOY_ENV_FILE" =~ ^/[A-Za-z0-9_./-]+$ && "$DEPLOY_ENV_FILE" != *'/../'* && "$DEPLOY_ENV_FILE" != *'/./'* ]] || { echo 'Invalid environment file path' >&2; exit 1; }
[[ "$DEPLOY_PM2_APP" =~ ^[A-Za-z0-9_-]+$ ]] || { echo 'Invalid PM2 application name' >&2; exit 1; }
[[ "$PRODUCTION_SITE_URL" =~ ^https://[A-Za-z0-9.-]+$ ]] || { echo 'Production site URL must be an HTTPS origin without a trailing slash' >&2; exit 1; }

key_dir="$(mktemp -d)"
trap 'rm -rf -- "$key_dir"' EXIT
chmod 700 "$key_dir"
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key_dir/id_deploy"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$key_dir/known_hosts"
chmod 600 "$key_dir/id_deploy" "$key_dir/known_hosts"

host_key_name="$DEPLOY_HOST"
if [ "$DEPLOY_SSH_PORT" != 22 ]; then
  host_key_name="[$DEPLOY_HOST]:$DEPLOY_SSH_PORT"
fi
ssh-keygen -F "$host_key_name" -f "$key_dir/known_hosts" >/dev/null || { echo 'Pinned SSH host key is missing' >&2; exit 1; }

ssh_options=(-i "$key_dir/id_deploy" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$key_dir/known_hosts" -o BatchMode=yes -o ConnectTimeout=10)
remote="$DEPLOY_USER@$DEPLOY_HOST"
remote_archive="zhongcheng-release-$RELEASE_SHA.tar.gz"
archive_digest="$(sha256sum "$archive" | cut -d ' ' -f 1)"

scp -P "$DEPLOY_SSH_PORT" "${ssh_options[@]}" -- "$archive" "$remote:$DEPLOY_ROOT/incoming/$remote_archive"
ssh -p "$DEPLOY_SSH_PORT" "${ssh_options[@]}" "$remote" \
  "bash -s -- '$DEPLOY_ROOT' '$DEPLOY_ENV_FILE' '$DEPLOY_PM2_APP' '$RELEASE_SHA' '$archive_digest' '$remote_archive' '$PRODUCTION_SITE_URL'" \
  < scripts/deploy.sh
