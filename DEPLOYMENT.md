# 众成二手车 GitHub Actions 部署

本文件针对仓库当前的 Next.js 16 standalone、Node.js 24、pnpm 11.25、PostgreSQL 16 和服务器外的图片目录。`docs/DEPLOYMENT_UBUNTU.md` 是使用 systemd 的部署示例。用户最初描述线上使用 PM2，但服务器上 `zhongcheng-used-cars` systemd 服务返回 `active`，而当前终端未找到 PM2；实际启动方式仍须核实。当前部署脚本只支持经核实的 PM2 接管，并会在上述 systemd 服务仍活动时拒绝切换。本仓库尚未配置或验证阿里云服务器。

## 发布流程

1. PR 运行 `Validate self-hosted Next.js / test-and-build`：用临时 PostgreSQL 16 运行测试，接着做 TypeScript 检查和 `pnpm build`。PR 任务没有生产环境或 SSH 密钥。
2. 合并到 `main` 后，同一工作流再次测试并生成 standalone 压缩包。它不会把生产 `.env`、数据库或图片打包。
3. 只有仓库变量 `PRODUCTION_DEPLOY_ENABLED=true`、生产网址已配置、且本次 push 没有修改 `database/migrations/` 时，才调用 `deploy.yml`。部署作业使用 GitHub `production` Environment 的密钥和串行并发组。
4. 发布作业上传通过测试的压缩包，服务器脚本检查 SSH 主机密钥、压缩包 SHA-256、Node/架构、PM2 启动路径、环境文件和图片目录，再解压到新版本目录。
5. `current` 软链接原子切换后，PM2 reload 服务。`/api/health` 必须在本机返回数据库连通且版本 SHA 正确；失败时切回旧版本并再次 reload。版本目录、上传文件、数据库和 PM2 日志保留。

仓库变量默认不存在，因此本配置合并后也不会自行连接服务器或接管线上服务。`workflow_dispatch` 可以在 `main` 手动重跑完整的检查与发布流程；涉及数据库迁移的 push 被自动跳过后，只能在单独审核并准备数据库后手动触发。

## 先核实服务器（只读）

在**阿里云服务器的 SSH 终端**执行以下完整命令。它们只读取进程、版本、路径与权限，不会重启网站，也不显示环境文件内容。命令中的三个路径仅用于探测仓库现有文档所写的位置；若实际目录不同，请补充实际路径。不要发送私钥、`DATABASE_URL` 或环境文件正文。

```bash
whoami
pwd
uname -s
uname -m
node --version
command -v node
command -v pm2
pm2 --version
pm2 list
ps -eo user,pid,args | grep -E '[P]M2|[s]erver.js|[n]ext start'
ls -ld /var/www/zhongcheng-used-cars /etc/zhongcheng-used-cars.env /var/lib/zhongcheng/uploads 2>&1
readlink -f /var/www/zhongcheng-used-cars
systemctl is-active zhongcheng-used-cars 2>/dev/null || true
```

确认方式：命令应输出 Node/PM2 版本、网站进程的系统用户与启动方式，以及现有目录的属主和权限。如果当前 SSH 用户的 `pm2 list` 为空，以 `ps` 中进程的属主为准，后续须在该属主下查看 PM2。还需核对实际域名、Nginx 回源端口、可用磁盘空间、备份状态及生产环境文件中的**变量名和路径**，不要把变量值发送到聊天或 GitHub。服务器架构必须是 Linux x86_64；目前 CI 的 Linux 构建产物尚未适配 ARM64。线上 Node.js 需为 24。

## 首次接管前的服务器条件

以下条件目前**均未验证**。得到上述只读信息后，才应给出适合该服务器的完整一次性创建命令；不要直接执行仓库里旧的 systemd 示例：

- 建立独立的普通部署账号和专用 SSH 密钥。该账号只能写部署版本目录、管理自己的 PM2 进程，并读取现有生产环境文件及外部上传目录所需权限；不要授予 root 或数据库管理员权限。私钥只放 GitHub `production` Environment Secret，公钥只加入服务器部署账号的 `authorized_keys`。
- 先核实活动 systemd 服务的 `ExecStart`、`WorkingDirectory` 和账号。如果它才是实际网站进程，应设计兼容该服务的发布方式并修改此 PR，而不应为了使用当前 PM2 脚本自行停掉它。若确认由 PM2 管理，再规划独立部署根目录，含 `incoming/`、`releases/`、指向已知可恢复版本的 `current` 软链接和仅由管理员创建的 `.auto-deploy-enabled` 标记。PM2 进程必须由专用部署账号运行，且其 `pm_exec_path` 必须精确为 `<部署根目录>/current/server.js`，`pm_cwd` 必须精确为 `<部署根目录>/current`。脚本会核对这些条件，不符合就拒绝发布。现有线上进程的转接会影响服务，因此必须在用户确认的维护窗口实施。
- 现有生产环境文件留在版本目录外，能由部署账号读取；必须包含 `NODE_ENV=production`、`HOSTNAME=127.0.0.1`、实际 `PORT`、`DATABASE_URL`、`UPLOAD_DIR`、`NEXT_PUBLIC_DEMO_MODE=false`、`NEXT_PUBLIC_SITE_URL`。`UPLOAD_DIR` 必须仍指向部署根目录外的现有持久化图片目录。脚本不会创建、覆盖或删除环境文件、图片或数据库，也不会执行 `pnpm db:migrate`。
- 在切换前做并核对数据库与图片备份。保留旧版本目录，确认 PM2 的开机恢复方式、Nginx 回源路径和站点访问正常。生产变更需先在测试实例演练；首次切换只有在用户确认后进行。

## GitHub 配置

在仓库 **Settings → Environments → production** 中建立生产环境。建议限制部署分支为 `main` 并设置必需审核人；该审核门槛会让每次自动发布等待审核，如需合并后完全自动发布，启用前应依赖 `main` 分支保护、必需 CI 和 PR 审核。禁止未审核的工作流修改直接进入 `main`。

| 名称 | 类型 | 用途与获取方法 |
| --- | --- | --- |
| `DEPLOY_SSH_KEY` | production Secret | 专用部署账号的私钥；由本地安全终端生成密钥对，公钥交给服务器管理员安装，私钥仅在 GitHub 环境密钥中录入。不要存入仓库或聊天。 |
| `DEPLOY_HOST` | production Secret | 阿里云服务器实际 SSH IP 或 DNS 名称，从服务器控制台核对。 |
| `DEPLOY_USER` | production Secret | 服务器实际专用部署账号名。 |
| `DEPLOY_KNOWN_HOSTS` | production Secret | 经阿里云控制台或可信带外渠道核对指纹后的 OpenSSH `known_hosts` 完整行；不能仅凭第一次 `ssh-keyscan` 输出信任服务器。 |
| `PRODUCTION_SITE_URL` | repository Variable | 实际线上 HTTPS 站点 origin，例如 `https://example.com`，不可带末尾 `/`。它会在构建时写入公开的 robots/sitemap 配置。 |
| `DEPLOY_ROOT` | repository Variable | 已准备好的服务器版本根目录的绝对路径。 |
| `DEPLOY_ENV_FILE` | repository Variable | 服务器已有生产环境文件的绝对路径；文件内容不进入 GitHub。 |
| `DEPLOY_PM2_APP` | repository Variable | 已转接到 `current` 软链接的 PM2 应用名。 |
| `DEPLOY_SSH_PORT` | repository Variable，可选 | 实际 SSH 端口，未设置时为 22。 |
| `PRODUCTION_DEPLOY_ENABLED` | repository Variable | 最后设置为字符串 `true` 才开启发布；首次服务器接管、授权和演练完成之前不要设置。 |

PR 的 CI 不读取这些生产 Secret。不要把 `DATABASE_URL`、管理员密码、图片或生产 `.env` 上传为 GitHub Secret 或 Artifact。部署账号的环境文件仍只在服务器上。

## 验证与回滚

首次得到授权后，应先在测试实例验证 SSH 主机密钥、独立账号、产物架构、PM2 路径及健康检查，然后在正式服务器做**只读预检**。首个生产发布须用户明确确认后进行。发布成功的 GitHub Actions 日志显示 `Deployment healthy: <提交 SHA>`；也可在服务器本机请求 `http://127.0.0.1:<实际端口>/api/health`，应得到 `ok: true` 和相同 SHA，再检查公开 HTTPS 站点与一张已有车辆图片。

脚本在新版本健康检查失败时会自动恢复旧软链接并 reload PM2，作业保持失败状态供排查。它不删除新旧版本目录或 PM2 日志。若回滚本身无法验证，停止继续发布，在服务器查看 `current` 指向和 `pm2 logs <实际应用名>`，依据已知稳定版本做人工恢复。数据库结构迁移必须另行审核、备份和执行；迁移后的代码回滚不能被视为数据库回滚。

以后在 Codex 提出修改需求，完成本地检查后创建 PR；审核代码与 CI 状态，再合并到 `main`。没有迁移的更新会按上述门槛自动发布。查看 GitHub Actions 的部署结果和健康检查；失败时按日志处理，必要时使用旧版本目录恢复。
