# 众成二手车 GitHub Actions 部署

## 已核实的架构

仓库使用 Next.js 16 standalone、Node.js 24、pnpm 11.25、PostgreSQL 16。阿里云服务器的 `zhongcheng-used-cars.service` 当前为 `active`，`User=zhongcheng`，`ExecStart=/usr/bin/node server.js`，`WorkingDirectory=/var/www/zhongcheng-used-cars/.next/standalone`，环境文件为 `/etc/zhongcheng-used-cars.env`，并设置了 `ProtectSystem=strict`。服务器已核实 `x86_64`、`/usr/bin/node v24.22.2`、`PORT=3000`、`UPLOAD_DIR=/var/lib/zhongcheng/uploads`；现有 `ReadWritePaths` 包括上传目录和整个旧应用目录。这与最初描述的 PM2 不一致；自动部署按实际运行的 systemd 服务设计，不安装或切换到 PM2。

公开网站 `https://zhongchengcars.com` 已返回 HTTP 200；旧应用目录为 `zhongcheng:zhongcheng 755`，环境文件为 `root:zhongcheng 640`，上传目录为 `zhongcheng:zhongcheng 750`。用户确认 PostgreSQL 与图片备份已验证可恢复；服务器根分区有 29G 可用。服务器环境文件的 `NEXT_PUBLIC_SITE_URL` 当前为 `http://localhost:3000`，线上 `robots.txt`、sitemap 已确实输出这个错误地址。GitHub 仓库已设置并复核非敏感变量 `PRODUCTION_SITE_URL=https://zhongchengcars.com` 和 `DEPLOY_LOCAL_PORT=3000`；本地生产构建验证了即使运行时环境仍为 localhost，生成的 robots/sitemap 也使用构建时域名。环境文件可另行审核修正，不属于自动部署脚本的修改范围。仓库及服务器尚未完成首次部署授权。**本 PR 保持草稿；`PRODUCTION_DEPLOY_ENABLED` 仍未设置，在用户确认首次切换之前不得启用。**

## 发布流程

1. PR 运行 `Validate self-hosted Next.js / test-and-build`：用临时 PostgreSQL 16 执行测试，再做 TypeScript 检查和 `pnpm build`。PR 作业没有生产 SSH 密钥。
2. 合并到 `main` 后，同一工作流重新测试并打包 standalone 服务。只有 `PRODUCTION_DEPLOY_ENABLED=true`、生产网址已配置、且本次 push 未修改 `database/migrations/`，才调用生产部署作业。手动 `workflow_dispatch` 可在单独审核数据库迁移后发布。
3. 部署作业从 GitHub `production` Environment 取得专用 SSH 私钥与固定的主机密钥，经 SSH 上传已测试产物到部署根目录的 `incoming/`。服务器核对 SHA-256、Node/CPU 架构、systemd 服务身份与路径、目录权限和受限重启命令。
4. 新版本解压到 `releases/<提交 SHA>/`，写入版本标记，原子切换 `current` 软链接，然后用**根账号拥有的固定命令**重启该 systemd 服务。这个单进程重启可能带来短暂连接中断。
5. 本机 `/api/health` 必须返回数据库连通且版本 SHA 正确。失败时脚本切回旧软链接并重启旧版，GitHub Actions 保持失败状态；旧版、新版和 systemd 日志都保留。

整个自动发布过程**不执行 SQL 迁移**，不读取或改写 `/etc/zhongcheng-used-cars.env`，不触碰 PostgreSQL 数据文件、`/var/lib/zhongcheng/uploads`、Nginx、Cloudflare 或 HTTPS 配置。CI 构建包不包含 `.env`。

## 首次接管：必须先核实再执行

以下命令在**阿里云服务器 SSH 终端**执行，均为只读，不会影响正在运行的网站，也不会输出环境变量值。请只发送命令结果，不要发送环境文件正文、密码或私钥。

```bash
stat -c '%U:%G %a %n' /var/www/zhongcheng-used-cars /var/www/zhongcheng-used-cars/.next/standalone /etc/zhongcheng-used-cars.env /var/lib/zhongcheng/uploads
ss -ltnp | grep ':3000' || true
```

确认方式：应看到现有目录所有者及权限和本机 3000 端口监听。若没有监听结果，应由服务器管理员核对 Nginx 回源配置。还需从阿里云控制台核对剩余磁盘、SSH 地址及主机密钥指纹，并确认已有数据库和图片备份可恢复。

完成只读检查后，才能制定并由用户确认首次生产转接的**完整命令**：

- 创建不具备 root 或数据库管理员权限的专用部署账号及 SSH 公钥，只允许其写新的版本根目录。版本目录设置为部署账号所有、`zhongcheng` 组和 setgid 权限，使运行账号可读取产物；只有每个版本的 `.next/cache` 允许该组写入。部署账号不需要读取生产环境文件。
- 把现有稳定 standalone 产物备份到新根目录的 `releases/`，用 `current` 软链接指向它。根目录还需有 `incoming/`、部署锁文件位置，以及管理员最后创建的 `.auto-deploy-enabled` 标记。
- 只调整当前 systemd 服务的 `WorkingDirectory` 为新 `current` 软链接，保留原 `User=zhongcheng`、`ExecStart=/usr/bin/node server.js`、`EnvironmentFile=/etc/zhongcheng-used-cars.env`。在 `ProtectSystem=strict` 下，`ReadWritePaths` 必须保留现有上传目录并改为允许新 `current/.next/cache` 写入。Nginx 回源端口不变。此步骤会重启网站，须先获得用户对具体命令和维护窗口的确认。
- 将仓库的 `deploy/zhongcheng-restart.sh` 以 root 所有安装到 `/usr/local/sbin/zhongcheng-restart`，并通过 `visudo` 仅授权部署账号无密码运行**这个固定命令**。它只重启 `zhongcheng-used-cars.service`，不接受参数。先在测试实例验证账号、权限、软链接、重启和回滚，再在正式机启用。

## GitHub 一次性设置

仓库已经创建 `production` Environment，并限制为受保护分支；当前受保护分支为 `main`。`main` 已设置必须经 PR、GitHub Actions 的 `test-and-build` 检查通过且与最新 main 同步，管理员也须遵守，禁止强推和删除。仓库目前由一人维护，必需批准人数为 0；合并前仍须由你亲自审阅代码，尤其是 `.github/workflows/`、`scripts/deploy*` 的改动。若以后有第二位可信维护者，可调整为至少 1 次批准。PR 作业只具备只读权限，不获得生产 Secret。[GitHub 对环境密钥及可复用工作流的说明](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)要求在被调用的部署作业设置 `environment`，本仓库已这样配置。

| 名称 | GitHub 位置 | 用途与安全获取方法 |
| --- | --- | --- |
| `DEPLOY_SSH_KEY` | production Secret | 专用部署账号私钥；在可信本地终端生成密钥对，公钥由服务器管理员安装，私钥只存 GitHub 环境密钥。 |
| `DEPLOY_HOST` | production Secret | 从阿里云控制台核对的实际 SSH IPv4 地址或 DNS 名称。 |
| `DEPLOY_USER` | production Secret | 实际创建的专用部署账号名。 |
| `DEPLOY_KNOWN_HOSTS` | production Secret | 与阿里云控制台或可信带外渠道核对指纹后的 OpenSSH `known_hosts` 完整行；不可只信任第一次 `ssh-keyscan` 输出。 |
| `PRODUCTION_SITE_URL` | repository Variable，已设置 | 已核实的 `https://zhongchengcars.com`，没有结尾 `/`；构建时写入公开的 robots/sitemap。 |
| `DEPLOY_ROOT` | repository Variable | 新建并验证的版本根目录绝对路径。 |
| `DEPLOY_LOCAL_PORT` | repository Variable，已设置 | 已核实的本机 Node 端口 `3000`。 |
| `DEPLOY_SSH_PORT` | repository Variable，可选 | 实际 SSH 端口，默认 22。 |
| `PRODUCTION_DEPLOY_ENABLED` | repository Variable | 最后设为字符串 `true` 才开启生产发布；首次演练和确认前保持未设置。 |

不要在 GitHub 设置 `DATABASE_URL`、生产 `.env`、管理员密码或图片密钥。本方案由现有 systemd `EnvironmentFile` 在服务器本地提供运行时配置；GitHub 只得到 SSH 部署账号权限。SSH 密钥尚未生成，四个 production Secret、`DEPLOY_ROOT` 和生产开关尚未设置。

## 首次验证与之后的回滚

取得用户对具体首次切换的确认后，先验证 SSH 主机密钥与最小权限账号，再在测试实例执行部署和失败回滚演练，最后才启用正式服务器。首发应检查 GitHub Actions 显示 `Deployment healthy: <提交 SHA>`；服务器本机 `http://127.0.0.1:<实际端口>/api/health` 应返回 `ok: true` 和同一 SHA，再检查公开 HTTPS 页面及已有车辆图片。

自动健康检查失败会恢复上一版本软链接并重启；作业仍显示失败以便排查。若回滚本身未能验证，应停止继续发布，在服务器检查 `current` 软链接和 `journalctl -u zhongcheng-used-cars`，根据保留的版本目录手动恢复。数据库迁移另行审核、备份和执行；代码回滚不等于数据库回滚。

日后在 Codex 提出网站修改需求，完成检查后创建 PR。审核代码和 GitHub CI，再合并到 `main`；满足上述开关和安全条件的普通更新会自动发布。
