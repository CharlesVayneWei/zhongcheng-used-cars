# 二手车展示与管理平台 V1.0

一个可实际运行的 Next.js + Supabase 二手车展示与管理网站。公开前台只读取已发布或已售车辆；管理员通过 Supabase Auth 登录后管理车辆、状态和图片。

## 技术架构

- Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4
- Supabase PostgreSQL、Auth、Storage
- Server Components 负责公开读取，Server Actions 负责写入
- PostgreSQL Row Level Security 是最终权限边界，前端隐藏不作为授权手段
- 车辆图片在浏览器压缩为 WebP，服务端再次校验类型与 5 MB 限制

```text
app/
  (public)/                 公开首页、车源列表、车辆详情
  admin/                    登录、车辆管理、车辆编辑、网站设置
components/
  cars/                     车辆卡片、图库、筛选与分页
  admin/                    后台表单、图片管理、删除确认
lib/
  actions/                  受管理员校验保护的 Server Actions
  data/                     公开与后台数据查询
  supabase/                 browser/server/public 客户端
  validation/               草稿、发布和图片服务端校验
supabase/migrations/        表、约束、触发器、RLS 与 Storage 策略
tests/                      校验、权限边界、格式化测试
```

## 本地启动

要求 Node.js 20.9+，推荐 pnpm。

1. 安装依赖：`pnpm install`。
2. 在 Supabase 创建项目，将 `.env.example` 复制为 `.env.local`，填写 Supabase URL、Anon Key 和站点 URL。
3. 在 Supabase SQL Editor 执行 [初始迁移](supabase/migrations/202610180001_initial_schema.sql)，或配置 Supabase CLI 后运行：

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. 依次执行 `supabase/migrations/` 中的迁移，然后创建首个管理员。在 `.env.local` 填写 `SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_EMAIL`、`ADMIN_LOGIN_NAME=weiling`、`ADMIN_PASSWORD=Weiling987100`、`ADMIN_RECOVERY_CODE=858607` 和随机生成的至少 32 位 `ADMIN_RECOVERY_ENCRYPTION_KEY`（不能保留示例占位值），运行：

   ```bash
   pnpm admin:create
   ```

   成功后从 `.env.local` 删除 `ADMIN_PASSWORD` 和 `SUPABASE_SERVICE_ROLE_KEY`；运行时需要保留找回口令和加密密钥。后台不提供公开注册。首次登录后可进入“账号安全”修改账号与密码。已存在的首个管理员执行新迁移后，登录账号为 `weiling`；其当前密码无法从 Supabase 还原，成功登录一次后才会建立加密找回记录。

5. 运行 `pnpm dev`：

   - 客户前台：[http://localhost:3000](http://localhost:3000)
   - 管理员登录：[http://localhost:3000/admin/login](http://localhost:3000/admin/login)
   - 忘记密码：[http://localhost:3000/admin/forgot-password](http://localhost:3000/admin/forgot-password)

## 无 Supabase 时的界面预览

仅在本地把 `NEXT_PUBLIC_DEMO_MODE=true`，即可用明确标识的演示车辆查看前台布局。演示模式不提供管理员写入，生产环境必须设置为 `false`。最终数据查询已经接到 Supabase，并非永久写死数据。

## 数据与状态规则

- `draft`：允许字段不完整，仅管理员可见。
- `published`：必填字段完整且至少有一张图片，公开展示并接受咨询。
- `sold`：公开保留但显示明显“已售”标记，隐藏购买咨询。
- `archived`：下架，仅管理员可见。
- 有保险时必须填写到期日；无保险或未知时服务端自动清空到期日。
- 里程和价格必须是非负整数；首付不能超过分期价格。
- 车况说明使用 React 纯文本转义并保留换行，不执行管理员输入的 HTML。

## 图片流程

1. 浏览器用 Canvas 将 JPG、PNG、WEBP 等比缩放到最长边 1920px，并转为 WebP。
2. Server Action 验证管理员、车辆归属、MIME 和大小。
3. 先上传 Storage，再创建 `car_images`；数据库插入失败时立即删除已上传对象。
4. 删除图片或车辆时同步清理 Storage；失败路径写入 `storage_cleanup_queue`，供运维重试。
5. 公开或已售车辆禁止删除最后一张图片。

## 权限与安全

- Proxy 提前拦截后台访问，每个 Server Action 仍会再次查询 Auth 用户及 `admin_profiles`。
- `cars`、`car_images`、设置、审计与清理队列全部启用 RLS。
- 匿名角色只能读取 `published/sold`，无法读取草稿或执行写操作。
- Storage 只允许管理员上传、修改和删除 JPG/PNG/WEBP。
- 管理页面禁止缓存和搜索索引，并设置防 iframe、MIME 嗅探与权限策略响应头。
- 删除车辆有浏览器二次确认；重要写入记录到 `admin_audit_logs`。
- 账号或密码修改只在已登录后台开放：先验证当前密码，提交后再验证新密码，最后要求重新登录。新密码需重复输入且一致。
- 找回密码使用加密副本，仅服务器持有解密密钥；口令尝试限制为每账号及来源 15 分钟内 5 次。固定默认口令仅适合受控环境，正式上线应更换。

## 验证

```bash
pnpm test
pnpm build
```

连接测试 Supabase 项目后，按以下顺序做验收：

1. 管理员登录，新建草稿。
2. 批量上传至少两张图片，调整顺序并设置封面。
3. 补齐字段并发布，确认首页、列表和详情立即显示。
4. 修改价格、里程、车况，刷新前台确认同步。
5. 标记已售，确认详情页隐藏咨询按钮；随后下架，确认公开 URL 返回不存在。
6. 无痕窗口访问后台，应跳转登录；直接使用匿名 Key 查询草稿，应被 RLS 拒绝。
7. 重启 Next.js 与浏览器，确认数据和 Storage 图片仍存在。

## 部署

项目通过 GitHub + Cloudflare Workers 持续部署，使用 OpenNext 适配完整的 Next.js 服务端功能：

1. 将仓库推送到 GitHub，生产分支使用 `main`。
2. 在 Cloudflare Dashboard 的 **Workers & Pages** 中创建应用并连接该 GitHub 仓库；Worker 名称必须与 `wrangler.jsonc` 中的 `zhongcheng-used-cars` 一致。
3. 构建命令填写 `pnpm run build:worker`，部署命令填写 `pnpm exec wrangler deploy`。
4. 在 Workers Builds 的变量和密钥中配置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_DEMO_MODE=false`、`ADMIN_RECOVERY_CODE` 与 `ADMIN_RECOVERY_ENCRYPTION_KEY`；不要配置不必要的 Service Role Key。
5. 将 Supabase Auth 的 Site URL 和 Redirect URLs 设置为正式域名，执行全部数据库迁移并创建管理员。
6. 推送到 `main` 后检查 Cloudflare 构建日志与 `*.workers.dev` 地址，再执行上述验收清单。

本地可运行 `pnpm preview` 在 Workers 运行时中预览，或在完成 Cloudflare 登录后运行 `pnpm deploy` 直接发布。

当前仓库未连接真实管理员账户或云服务密钥；示例中的初始密码仅在完成 Supabase 初始化后生效。
