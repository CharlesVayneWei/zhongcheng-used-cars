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
chmod 2750 "$root/releases"
printf 'old server\n' > "$root/releases/$old_sha/server.js"
printf 'keep image\n' > "$test_dir/uploads/image.webp"
touch "$root/.auto-deploy-enabled"
ln -s "$root/releases/$old_sha" "$root/current"

cat > "$test_dir/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == show && "$2" == -p ]]; then
  case "$3" in
    User) printf 'User=zhongcheng\n' ;;
    WorkingDirectory) printf 'WorkingDirectory=%s/current\n' "$TEST_DEPLOY_ROOT" ;;
    ExecStart) printf 'ExecStart={ path=/usr/bin/node ; argv[]=/usr/bin/node server.js ; ignore_errors=no }\n' ;;
    *) exit 1 ;;
  esac
elif [[ "$1" == is-active ]]; then
  exit 0
else
  exit 1
fi
EOF

cat > "$test_dir/bin/id" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == -gn && "$2" == zhongcheng ]]; then
  stat -c %G "$TEST_DEPLOY_ROOT/releases"
else
  exit 1
fi
EOF

cat > "$test_dir/bin/sudo" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == -n && "$2" == -l ]]; then
  exit 0
elif [[ "$1" == -n && "$2" == "$ZC_RESTART_HELPER" ]]; then
  exit 0
fi
exit 1
EOF

cat > "$test_dir/bin/curl" <<'EOF'
#!/usr/bin/env bash
release="$(basename "$(realpath -e "$TEST_DEPLOY_ROOT/current")")"
if [[ "$release" == "${TEST_FAIL_SHA:-none}" ]]; then
  printf '{"ok":false}\n'
else
  printf '{"ok":true,"release":"%s"}\n' "$release"
fi
EOF

printf '#!/usr/bin/env sh\nexit 0\n' > "$test_dir/bin/restart"
chmod +x "$test_dir/bin/"*
export PATH="$test_dir/bin:$PATH" TEST_DEPLOY_ROOT="$root"
export ZC_RESTART_HELPER="$test_dir/bin/restart" ZC_NODE_BINARY="$(command -v node)"

make_release() {
  local sha="$1" source_dir="$test_dir/source-$1" archive_name="zhongcheng-release-$1.tar.gz"
  mkdir -p "$source_dir/.next/static" "$source_dir/public"
  printf 'new server\n' > "$source_dir/server.js"
  tar -C "$source_dir" -czf "$root/incoming/$archive_name" .
  sha256sum "$root/incoming/$archive_name" | cut -d ' ' -f 1
}

first_digest="$(make_release "$first_sha")"
bash scripts/deploy.sh "$root" "$first_sha" "$first_digest" "zhongcheng-release-$first_sha.tar.gz" 3000
[[ "$(realpath -e "$root/current")" == "$root/releases/$first_sha" ]]
[[ "$(cat "$root/releases/$first_sha/.release-sha")" == "$first_sha" ]]

bad_digest="$(make_release "$bad_sha")"
export TEST_FAIL_SHA="$bad_sha"
if bash scripts/deploy.sh "$root" "$bad_sha" "$bad_digest" "zhongcheng-release-$bad_sha.tar.gz" 3000; then
  echo 'Unhealthy release unexpectedly succeeded' >&2
  exit 1
fi
[[ "$(realpath -e "$root/current")" == "$root/releases/$first_sha" ]]
[[ -f "$test_dir/uploads/image.webp" && -f "$root/releases/$old_sha/server.js" && -f "$root/releases/$bad_sha/server.js" ]]
echo 'Systemd deployment activation and automatic rollback smoke test passed'
