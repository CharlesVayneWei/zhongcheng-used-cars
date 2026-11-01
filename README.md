# 众成二手车展示与管理平台

Next.js 16 自托管应用，前台展示公开及已售车辆，后台管理车辆、图片和网站设置。运行时使用本机 PostgreSQL 与服务器文件系统，不依赖 Supabase Database、Auth 或 Storage。

## 架构

- Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4
- PostgreSQL 16，使用参数化 `pg` 查询；默认连接池上限为 4
- bcrypt 管理员密码哈希、数据库会话、HttpOnly Cookie、数据库登录限流
- 一次性密码重置令牌；不保存、加密或显示可恢复的原密码
- 图片由服务端验证真实格式并重新编码为 WebP，存放在项目目录外
- Server Actions 和后台数据访问均在服务端重新校验管理员会话

## 本地启动

要求 Node.js 24、pnpm 和 PostgreSQL 16。

1. 复制 `.env.example` 为 `.env.local`，只填写本地测试值。不要提交该文件。
2. 创建数据库后执行迁移：

   ```bash
   pnpm install
   pnpm db:migrate
   ```

3. 临时设置 `ADMIN_LOGIN_NAME`、`ADMIN_PASSWORD`、`ADMIN_DISPLAY_NAME`，创建管理员：

   ```bash
   pnpm admin:create
   ```

   创建后立即从环境文件中删除 `ADMIN_PASSWORD`。

4. 启动：

   ```bash
   pnpm dev
   ```

管理员登录位于 `/admin/login`。仅做前台界面预览时可设 `NEXT_PUBLIC_DEMO_MODE=true`；生产必须为 `false`。

## 数据与权限规则

- `draft`、`archived` 仅管理员可见；公开查询固定只读取 `published`、`sold`。
- 发布或标记已售前，必填字段必须完整且至少有一张图片。
- 公开/已售车辆不能删除最后一张图片；一辆车最多一个封面。
- 所有 SQL 输入均参数化，数据库连接仅来自服务端 `DATABASE_URL`。
- 会话 Cookie 为 HttpOnly、SameSite=Lax，生产环境启用 Secure；数据库仅保存随机令牌的 SHA-256 哈希。
- 登录和密码重置按来源与账号组合限流；后台 Proxy 只做快速预检，真实授权在数据访问层和每个写操作内完成。

## 图片

- 浏览器先压缩以改善上传体验，服务端仍会检查 JPG/PNG/WebP 文件签名、重新解码并输出 WebP。
- 单文件原始和输出大小均限制为 5 MB，每批请求限制为 7 MB。
- 文件名由服务器生成 UUID，只允许 `<车辆 UUID>/<图片 UUID>.webp`。
- `/media/cars/...` 由 Next.js Route Handler 提供：公开车辆可读，草稿图片必须有有效管理员会话。
- 生产目录为 `/var/lib/zhongcheng/uploads`，不得放入 Git 仓库或 Nginx 静态目录。

## 常用命令

```bash
pnpm db:migrate          # 执行未应用的 PostgreSQL 迁移
pnpm admin:create        # 创建管理员，或激活从 Supabase 导入的禁用账号
pnpm admin:reset-token   # 生成 30 分钟有效的一次性密码重置令牌
pnpm storage:cleanup     # 重试删除队列中的本地图片
pnpm test                # 单元、安全边界和图片测试
pnpm test:integration    # 需要 TEST_DATABASE_URL 的真实 PostgreSQL 测试
pnpm typecheck
pnpm build
pnpm start
```

密码重置令牌只在命令行显示一次，数据库保存其哈希；令牌使用后立即失效，并注销该管理员的全部会话。

`TEST_DATABASE_URL` 只用于集成测试：数据库名称必须明确包含 `test`、`testing` 或 `ci`，不得与 `DATABASE_URL` 相同，也不得配置在生产 systemd 环境文件中。测试只在随机 `zc_test_*` schema 内建表，结束后删除该临时 schema，不删除数据库。

## Supabase 数据迁移

旧 `supabase/` 目录仅作为历史结构和源端说明保留，应用运行时不会加载它。车辆、图片、设置、审计日志的只读导入、验证和回滚流程见 [Supabase 数据迁移说明](docs/SUPABASE_DATA_MIGRATION.md)。工具不会删除或修改原 Supabase 项目。

## 生产部署

Ubuntu 24.04、Node.js 24、PostgreSQL 16、systemd、Nginx 的完整步骤见 [阿里云部署说明](docs/DEPLOYMENT_UBUNTU.md)。生产推荐启动构建后的 standalone 服务：

```bash
HOSTNAME=127.0.0.1 PORT=3000 NODE_ENV=production node .next/standalone/server.js
```

## 提交安全

`.env*`、数据库密码、管理员密码、重置令牌、Supabase 源凭据、备份和上传图片都不得提交。仓库只包含无密钥的示例配置。
