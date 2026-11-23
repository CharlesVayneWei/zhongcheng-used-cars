#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != Linux ]]; then
  echo 'Deployment smoke test requires Linux symlinks; run it in GitHub Actions'
  exit 0
fi

test_dir="$(mktemp -d)"
trap 'rm -rf -- "$test_dir"' EXIT
root="$test_dir/releases-root"
old_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
first_sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bad_sha=cccccccccccccccccccccccccccccccccccccccc
mkdir -p "$root/incoming" "$root/releases/$old_sha" "$test_dir/uploads" "$test_dir/bin"
printf 'old server\n' > "$root/releases/$old_sha/server.js"
touch "$root/.auto-deploy-enabled"
ln -s "$root/releases/$old_sha" "$root/current"

cat > "$test_dir/runtime.env" <<EOF
NODE_ENV=production
HOSTNAME=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://test-only
UPLOAD_DIR=$test_dir/uploads
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SITE_URL=https://example.com
EOF

cat > "$test_dir/bin/pm2" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == jlist ]]; then
  printf '[{"name":"cars","pm2_env":{"status":"online","pm_exec_path":"%s/current/server.js","pm_cwd":"%s/current"}}]\n' "$TEST_DEPLOY_ROOT" "$TEST_DEPLOY_ROOT"
elif [[ "$1" == reload ]]; then
  exit 0
else
  exit 1
fi
EOF

cat > "$test_dir/bin/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "${ZC_RELEASE_SHA:-}" == "${TEST_FAIL_SHA:-none}" ]]; then
  printf '{"ok":false}\n'
else
  printf '{"ok":true,"release":"%s"}\n' "$ZC_RELEASE_SHA"
fi
EOF

chmod +x "$test_dir/bin/"*
export PATH="$test_dir/bin:$PATH" TEST_DEPLOY_ROOT="$root"

make_release() {
  local sha="$1" source_dir="$test_dir/source-$1" archive_name="zhongcheng-release-$1.tar.gz"
  mkdir -p "$source_dir/.next/static" "$source_dir/public"
  printf 'new server\n' > "$source_dir/server.js"
  tar -C "$source_dir" -czf "$root/incoming/$archive_name" .
  sha256sum "$root/incoming/$archive_name" | cut -d ' ' -f 1
}

first_digest="$(make_release "$first_sha")"
bash scripts/deploy.sh "$root" "$test_dir/runtime.env" cars "$first_sha" "$first_digest" "zhongcheng-release-$first_sha.tar.gz" https://example.com
[[ "$(realpath -e "$root/current")" == "$root/releases/$first_sha" ]]

bad_digest="$(make_release "$bad_sha")"
export TEST_FAIL_SHA="$bad_sha"
if bash scripts/deploy.sh "$root" "$test_dir/runtime.env" cars "$bad_sha" "$bad_digest" "zhongcheng-release-$bad_sha.tar.gz" https://example.com; then
  echo 'Unhealthy release unexpectedly succeeded' >&2
  exit 1
fi
[[ "$(realpath -e "$root/current")" == "$root/releases/$first_sha" ]]
[[ -d "$test_dir/uploads" && -f "$root/releases/$old_sha/server.js" && -f "$root/releases/$bad_sha/server.js" ]]
echo 'Deployment activation and automatic rollback smoke test passed'
