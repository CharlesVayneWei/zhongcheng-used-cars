# Supabase 数据迁移说明

本工具只从 Supabase 读取数据，并写入新 PostgreSQL 和本地图片目录。它不会删除、更新或停用原 Supabase 项目。

## 迁移内容

- `admin_profiles`：导入为禁用管理员，保留 UUID、登录名和显示名；不迁移 Supabase Auth 密码。
- `cars`、`car_images`、`site_settings`、`admin_audit_logs`：保留业务字段和关联 UUID。
- Storage 图片：下载后重新解码、限制尺寸并转换为 WebP，再写入目标上传目录。
- 每条记录写入 `data_migration_records`，记录来源、目标 ID、图片校验和及归属，用于重复执行、验证和回滚。

## 迁移前

1. 保持原 Supabase 项目和 bucket 不变，不执行删除。
2. 先在目标服务器执行 `pnpm db:migrate`。
3. 对目标数据库和 `/var/lib/zhongcheng/uploads` 做一次备份。
4. 为源数据库准备只读连接。若图片 bucket 不是公开读取，再临时提供源项目 service-role key；不要把它放入应用运行环境。
5. 迁移期间暂停旧后台写入，避免源数据在校验前继续变化。

创建被 Git 忽略的 `.env.migration`：

```dotenv
DATABASE_URL=postgresql://zhongcheng_app:URL_ENCODED_PASSWORD@127.0.0.1:5432/zhongcheng_db
UPLOAD_DIR=/var/lib/zhongcheng/uploads
MIGRATION_SOURCE_KEY=old-supabase-project-ref
SUPABASE_SOURCE_DATABASE_URL=postgresql://READ_ONLY_SOURCE_USER:URL_ENCODED_PASSWORD@SOURCE_HOST:5432/postgres
SUPABASE_SOURCE_URL=https://PROJECT_REF.supabase.co
# 仅私有 bucket 需要；迁移结束后立即删除。
SUPABASE_SOURCE_SERVICE_ROLE_KEY=
```

`MIGRATION_SOURCE_KEY` 必须稳定且唯一。重复执行同一来源时使用完全相同的值。

## 导入、验证、回滚

```bash
pnpm migrate:supabase -- import
pnpm migrate:supabase -- verify
pnpm migrate:supabase -- rollback
```

导入具有以下保护：

- 目标 ID 已存在但没有该来源的迁移记录时立即停止，不覆盖未知数据。
- 图片先进入上传目录内的临时区，数据库事务失败时恢复旧文件。
- 已导入的相同来源可重复执行；目标记录仍由迁移账本识别。
- 校验会比较源端与迁移账本数量，并逐张检查目标 WebP 文件及 SHA-256。
- 回滚只删除该 `MIGRATION_SOURCE_KEY` 记录的车辆、图片和审计导入项，并恢复迁移前的网站设置；源端不受影响。

回滚应在正式切流和新后台写入前完成。若已在目标后台修改导入车辆，回滚仍会删除这些来源车辆，因此先备份并人工确认。

## 管理员切换

导入管理员默认禁用，因为不能也不应从 Supabase Auth 还原明文密码。导入完成后，用与旧管理员相同的登录名执行：

在权限为 `0600` 的临时环境文件中设置 `ADMIN_LOGIN_NAME`、`ADMIN_DISPLAY_NAME`、`ADMIN_PASSWORD`，加载后执行 `pnpm admin:create`。该命令会为禁用账号写入新的 bcrypt 哈希并激活账号。完成后立即删除临时文件，不要把密码直接写入 shell 命令或历史。

## 切流验收

1. `verify` 返回 `status: verified`。
2. 管理员登录，新建草稿、上传图片、发布、设为已售、下架均正常。
3. 无痕窗口无法打开后台或草稿图片。
4. 首页、列表、详情仅显示公开/已售车辆。
5. 对源数据库、目标数据库、源 Storage 数量和目标图片目录做人工抽样。
6. 原 Supabase 项目至少保留到一个完整备份周期后，再由负责人单独决定后续处置；本迁移不包含删除步骤。
