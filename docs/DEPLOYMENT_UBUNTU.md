# 阿里云 Ubuntu 24.04 生产部署

目标：Node.js 24、PostgreSQL 16、Nginx、systemd，应用目录 `/var/www/zhongcheng-used-cars`，图片目录 `/var/lib/zhongcheng/uploads`。所有命令在测试实例演练后再用于正式机。

## 1. 系统与运行账号

```bash
sudo apt update
sudo apt install -y git curl ca-certificates xz-utils nginx postgresql-16 postgresql-client-16
sudo adduser --system --group --home /var/www/zhongcheng-used-cars --no-create-home zhongcheng
sudo install -d -o zhongcheng -g zhongcheng -m 0750 /var/www/zhongcheng-used-cars
sudo install -d -o zhongcheng -g zhongcheng -m 0750 /var/lib/zhongcheng/uploads
sudo install -d -o root -g root -m 0700 /var/backups/zhongcheng
```

Ubuntu 24.04 默认仓库可提供 PostgreSQL；若镜像中没有 16，按 [PostgreSQL 官方 Ubuntu Apt 仓库说明](https://www.postgresql.org/download/linux/ubuntu/) 添加 `noble-pgdg` 后安装 `postgresql-16`。

Node.js 24 建议从 [Node.js 官方 `latest-v24.x` 下载页](https://nodejs.org/download/release/latest-v24.x/) 选择当前 Linux x64/arm64 构建，核对 `SHASUMS256.txt` 后解压到 `/usr/local/lib/nodejs`，再把 `node`、`npm`、`npx` 链接到 `/usr/local/bin`。确认：

```bash
node --version
npm --version
sudo npm install --global pnpm@11.25.0
pnpm --version
```

不要直接执行来源不明的远程安装脚本。

## 2. PostgreSQL 16

进入 PostgreSQL 控制台，密码用 `\password` 交互设置，避免出现在 shell 历史：

```bash
sudo -u postgres psql
```

```sql
create role zhongcheng_app login;
\password zhongcheng_app
create database zhongcheng_db owner zhongcheng_app encoding 'UTF8';
revoke all on database zhongcheng_db from public;
grant connect, temporary on database zhongcheng_db to zhongcheng_app;
\q
```

确认 `pg_hba.conf` 对 `127.0.0.1/32` 使用 `scram-sha-256`，并保持 PostgreSQL 只监听本机。2 GB 机器可从以下保守值开始，再按监控调整：

```conf
listen_addresses = '127.0.0.1'
max_connections = 30
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 4MB
maintenance_work_mem = 64MB
password_encryption = 'scram-sha-256'
```

```bash
sudo systemctl restart postgresql
sudo systemctl enable postgresql
```

## 3. 代码与环境变量

把仓库检出到部署目录。不要复制开发机的 `.env.local`：

```bash
sudo -u zhongcheng git clone YOUR_GIT_URL /var/www/zhongcheng-used-cars
cd /var/www/zhongcheng-used-cars
```

创建 `/etc/zhongcheng-used-cars.env`，数据库密码必须 URL 编码，文件中不要放 `ADMIN_PASSWORD`：

```dotenv
NODE_ENV=production
HOSTNAME=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://zhongcheng_app:URL_ENCODED_PASSWORD@127.0.0.1:5432/zhongcheng_db
DB_POOL_MAX=4
UPLOAD_DIR=/var/lib/zhongcheng/uploads
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
PASSWORD_BCRYPT_ROUNDS=12
ADMIN_SESSION_HOURS=12
PASSWORD_RESET_MINUTES=30
```

生产环境文件中不要设置 `TEST_DATABASE_URL`。集成测试必须使用名称明确包含 `test`、`testing` 或 `ci` 的独立数据库，并且代码会拒绝与 `DATABASE_URL` 相同的连接。

```bash
sudo chown root:zhongcheng /etc/zhongcheng-used-cars.env
sudo chmod 0640 /etc/zhongcheng-used-cars.env
```

## 4. 安装、迁移、构建、管理员

```bash
sudo -u zhongcheng bash -lc 'set -a; source /etc/zhongcheng-used-cars.env; set +a; cd /var/www/zhongcheng-used-cars; pnpm install --frozen-lockfile'
sudo -u zhongcheng bash -lc 'set -a; source /etc/zhongcheng-used-cars.env; set +a; cd /var/www/zhongcheng-used-cars; pnpm db:migrate'
sudo -u zhongcheng bash -lc 'set -a; source /etc/zhongcheng-used-cars.env; set +a; cd /var/www/zhongcheng-used-cars; NODE_OPTIONS=--max-old-space-size=1536 pnpm build'
```

2 GB 机器构建时若内存不足，可临时增加 2 GB swap，构建完成并确认运行稳定后再决定是否保留；不要用更大的 Node 堆挤压 PostgreSQL。

`pnpm build` 会自动把 `public` 与 `.next/static` 复制到 standalone 运行目录。可用以下命令再次核对或手工补齐：

```bash
sudo -u zhongcheng cp -a /var/www/zhongcheng-used-cars/public /var/www/zhongcheng-used-cars/.next/standalone/
sudo -u zhongcheng mkdir -p /var/www/zhongcheng-used-cars/.next/standalone/.next
sudo -u zhongcheng cp -a /var/www/zhongcheng-used-cars/.next/static /var/www/zhongcheng-used-cars/.next/standalone/.next/
sudo install -d -o zhongcheng -g zhongcheng -m 0750 /var/www/zhongcheng-used-cars/.next/standalone/.next/cache
```

首次创建管理员时，制作一个临时且权限为 `0600` 的环境文件，加入 `ADMIN_LOGIN_NAME`、`ADMIN_DISPLAY_NAME`、`ADMIN_PASSWORD`，运行后立即安全删除该临时文件：

```bash
sudo -u zhongcheng bash -lc 'set -a; source /etc/zhongcheng-used-cars.env; source /path/to/temporary-admin.env; set +a; cd /var/www/zhongcheng-used-cars; pnpm admin:create'
```

## 5. systemd

复制仓库内 [systemd 示例](../deploy/zhongcheng-used-cars.service) 到 `/etc/systemd/system/zhongcheng-used-cars.service`：

```bash
sudo cp deploy/zhongcheng-used-cars.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zhongcheng-used-cars
sudo systemctl status zhongcheng-used-cars
journalctl -u zhongcheng-used-cars -n 100 --no-pager
```

生产启动命令本质为：

```bash
HOSTNAME=127.0.0.1 PORT=3000 NODE_ENV=production node .next/standalone/server.js
```

## 6. Nginx 与 HTTPS

把 [Nginx 示例](../deploy/nginx-zhongcheng.conf) 复制到 `/etc/nginx/sites-available/zhongcheng-used-cars`，替换域名：

```bash
sudo cp deploy/nginx-zhongcheng.conf /etc/nginx/sites-available/zhongcheng-used-cars
sudo ln -s /etc/nginx/sites-available/zhongcheng-used-cars /etc/nginx/sites-enabled/zhongcheng-used-cars
sudo nginx -t
sudo systemctl reload nginx
```

先确认 HTTP，再用受信任证书工具申请 HTTPS。安全组只开放 22（限制来源）、80、443；3000 和 5432 不对公网开放。图片必须继续经 `/media/cars` Route Handler，不要把上传目录配置成 Nginx `alias`，否则会绕过草稿权限。

## 7. 更新发布

```bash
sudo systemctl stop zhongcheng-used-cars
sudo -u zhongcheng git -C /var/www/zhongcheng-used-cars pull --ff-only
sudo -u zhongcheng bash -lc 'set -a; source /etc/zhongcheng-used-cars.env; set +a; cd /var/www/zhongcheng-used-cars; pnpm install --frozen-lockfile; pnpm db:migrate; NODE_OPTIONS=--max-old-space-size=1536 pnpm build'
sudo -u zhongcheng cp -a /var/www/zhongcheng-used-cars/public /var/www/zhongcheng-used-cars/.next/standalone/
sudo -u zhongcheng mkdir -p /var/www/zhongcheng-used-cars/.next/standalone/.next
sudo -u zhongcheng cp -a /var/www/zhongcheng-used-cars/.next/static /var/www/zhongcheng-used-cars/.next/standalone/.next/
sudo install -d -o zhongcheng -g zhongcheng -m 0750 /var/www/zhongcheng-used-cars/.next/standalone/.next/cache
sudo systemctl start zhongcheng-used-cars
```

执行数据库迁移前先备份。迁移文件执行后不可修改，应新增下一编号文件。

可每小时以 `zhongcheng` 用户运行一次 `pnpm storage:cleanup`，重试少数因瞬时文件系统错误进入队列的图片删除任务。该命令每次最多处理 100 项，且会再次验证路径范围。

## 8. 回滚决策

每次发布前记录 `git rev-parse HEAD`，并先生成数据库与图片备份。

- 仅代码回归、且本次没有数据库迁移：停止服务，在干净的服务器工作区执行 `git switch --detach <KNOWN_GOOD_COMMIT>`，重新安装、构建并启动。不要使用 `git reset --hard` 覆盖未确认的文件。
- 已执行新数据库迁移：迁移文件采用只前进策略，不手写反向 SQL。先把发布前备份恢复到独立验证库，确认车辆、管理员和图片数量，再制定维护窗口内的数据库切换方案。
- Supabase 首次导入尚未正式切流：可按 [Supabase 数据迁移说明](SUPABASE_DATA_MIGRATION.md) 执行带来源账本的 `rollback`。正式后台已经修改导入车辆后，不应直接回滚，应先备份并人工核对。
- 原 Supabase 项目始终保留；任何回滚步骤都不会删除源项目。

## 9. 备份与恢复

仓库提供 `deploy/backup.sh`，同时备份 PostgreSQL 自定义格式和图片 tar 包：

```bash
sudo install -o root -g root -m 0750 deploy/backup.sh /usr/local/sbin/backup-zhongcheng
sudo /usr/local/sbin/backup-zhongcheng
```

可用 root cron 每天执行，并把备份复制到另一台机器或对象存储。只保存在同一块 40 GB 云盘不构成可靠备份。

先校验备份，并恢复到独立验证数据库和独立图片目录；以下命令不会覆盖当前生产库：

```bash
sha256sum -c SHA256SUMS
sudo -u postgres createdb --owner=zhongcheng_app zhongcheng_restore_test
sudo -u postgres pg_restore --no-owner --role=zhongcheng_app --dbname=zhongcheng_restore_test zhongcheng_db.dump
sudo install -d -o zhongcheng -g zhongcheng -m 0750 /var/lib/zhongcheng/uploads-restore-test
sudo tar -xzf uploads.tar.gz -C /var/lib/zhongcheng/uploads-restore-test
```

验证库确认无误后，再单独制定生产替换步骤并取得明确确认。`pg_restore --clean` 会覆盖现有目标对象，本说明不把它作为默认恢复命令。恢复后需重新运行前台抽样、后台登录、图片读取和 `pnpm db:migrate` 检查。

## 10. 上线验收

```bash
curl -I https://YOUR_DOMAIN/
curl -I https://YOUR_DOMAIN/cars
curl -I https://YOUR_DOMAIN/admin/login
```

另外人工验证：未登录后台跳转、错误登录限流、管理员改密后旧会话失效、草稿不可公开读取、WebP 上传/排序/封面/删除、已售隐藏咨询、服务重启后数据与图片仍在。
