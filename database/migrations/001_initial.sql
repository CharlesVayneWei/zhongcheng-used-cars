-- 众成二手车：自托管 PostgreSQL 16 初始结构。
-- 由 scripts/db-migrate.mjs 在事务和 advisory lock 中执行。

create extension if not exists pgcrypto;

create type car_status as enum ('draft', 'published', 'sold', 'archived');
create type insurance_status as enum ('insured', 'uninsured', 'unknown');

create table admins (
  id uuid primary key default gen_random_uuid(),
  login_name text not null,
  display_name text,
  password_hash text not null,
  disabled boolean not null default false,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admins_login_name_format check (login_name ~ '^[a-z][a-z0-9_-]{2,31}$'),
  constraint admins_password_hash_ck check (length(password_hash) between 20 and 255)
);
create unique index admins_login_name_unique on admins (lower(login_name));

create table admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admins(id) on delete cascade,
  token_hash char(64) not null unique,
  ip_hash char(64),
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint admin_sessions_expiry_ck check (expires_at > created_at)
);
create index admin_sessions_admin_idx on admin_sessions(admin_id);
create index admin_sessions_expiry_idx on admin_sessions(expires_at);

create table admin_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admins(id) on delete cascade,
  token_hash char(64) not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  constraint admin_password_reset_expiry_ck check (expires_at > created_at)
);
create index admin_password_reset_admin_idx on admin_password_reset_tokens(admin_id, expires_at desc);

create table auth_rate_limits (
  scope text not null,
  fingerprint char(64) not null,
  attempts integer not null default 0 check (attempts >= 0),
  window_started timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, fingerprint)
);
create index auth_rate_limits_updated_idx on auth_rate_limits(updated_at);

create table cars (
  id uuid primary key default gen_random_uuid(),
  title text,
  brand text,
  model text,
  registration_year integer,
  registration_province text,
  registration_city text,
  insurance_status insurance_status not null default 'unknown',
  insurance_expiry date,
  mileage_km bigint,
  cash_price_yuan bigint,
  installment_price_yuan bigint,
  down_payment_yuan bigint,
  condition_description text,
  status car_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references admins(id),
  updated_by uuid references admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cars_registration_year_ck check (
    registration_year is null or registration_year between 1980 and extract(year from current_date)::integer + 1
  ),
  constraint cars_mileage_ck check (mileage_km is null or mileage_km >= 0),
  constraint cars_cash_price_ck check (cash_price_yuan is null or cash_price_yuan >= 0),
  constraint cars_installment_price_ck check (installment_price_yuan is null or installment_price_yuan >= 0),
  constraint cars_down_payment_ck check (down_payment_yuan is null or down_payment_yuan >= 0),
  constraint cars_installment_relation_ck check (
    down_payment_yuan is null or (installment_price_yuan is not null and down_payment_yuan <= installment_price_yuan)
  ),
  constraint cars_insurance_expiry_ck check (
    (insurance_status = 'insured' and insurance_expiry is not null) or
    (insurance_status <> 'insured' and insurance_expiry is null)
  ),
  constraint cars_public_fields_ck check (
    status not in ('published', 'sold') or (
      nullif(btrim(title), '') is not null and
      nullif(btrim(brand), '') is not null and
      nullif(btrim(model), '') is not null and
      registration_year is not null and
      nullif(btrim(registration_province), '') is not null and
      nullif(btrim(registration_city), '') is not null and
      mileage_km is not null and
      cash_price_yuan is not null and
      nullif(btrim(condition_description), '') is not null
    )
  )
);

create table car_images (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars(id) on delete cascade,
  storage_path text not null unique,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  mime_type text not null default 'image/webp' check (mime_type = 'image/webp'),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  created_by uuid references admins(id),
  created_at timestamptz not null default now(),
  constraint car_images_storage_path_ck check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  ),
  constraint car_images_car_sort_unique unique (car_id, sort_order) deferrable initially immediate
);
create unique index car_images_one_cover_per_car on car_images(car_id) where is_cover;
create index car_images_car_sort_idx on car_images(car_id, sort_order);
create index cars_public_listing_idx on cars(status, published_at desc);
create index cars_filters_idx on cars(brand, registration_year, cash_price_yuan, mileage_km);

create table site_settings (
  id boolean primary key default true check (id),
  site_name text not null default '众成精品车行',
  tagline text not null default '真实车源，透明信息',
  consultation_phone text,
  consultation_wechat text,
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);
insert into site_settings (id) values (true) on conflict (id) do nothing;

create table admin_audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references admins(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  legacy_source_id bigint,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on admin_audit_logs(created_at desc);

create table storage_cleanup_queue (
  storage_path text primary key,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table data_migration_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table data_migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references data_migration_sources(id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'failed', 'rolled_back')),
  previous_settings jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table data_migration_records (
  source_id uuid not null references data_migration_sources(id) on delete cascade,
  entity_type text not null,
  source_entity_id text not null,
  target_entity_id text not null,
  content_hash char(64),
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  primary key (source_id, entity_type, source_entity_id)
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger admins_set_updated_at before update on admins
for each row execute function set_updated_at();
create trigger cars_set_updated_at before update on cars
for each row execute function set_updated_at();
create trigger site_settings_set_updated_at before update on site_settings
for each row execute function set_updated_at();
create trigger cleanup_queue_set_updated_at before update on storage_cleanup_queue
for each row execute function set_updated_at();

create or replace function ensure_car_has_image_before_publish()
returns trigger language plpgsql as $$
begin
  if new.status in ('published', 'sold') and
     not exists (select 1 from car_images where car_id = new.id) then
    raise exception '发布或标记已售前至少需要一张车辆图片';
  end if;
  return new;
end;
$$;

create constraint trigger cars_require_image_to_publish
after insert or update of status on cars
deferrable initially immediate
for each row execute function ensure_car_has_image_before_publish();

create or replace function prevent_last_public_image_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from cars where id = old.car_id and status in ('published', 'sold')) and
     not exists (select 1 from car_images where car_id = old.car_id and id <> old.id) then
    raise exception '在售或已售车辆必须保留至少一张图片';
  end if;
  return old;
end;
$$;

create trigger car_images_keep_last_public
before delete on car_images
for each row execute function prevent_last_public_image_delete();

create or replace function consume_auth_attempt(
  p_scope text,
  p_fingerprint char(64),
  p_max_attempts integer,
  p_window interval
)
returns boolean language plpgsql as $$
declare current_attempts integer;
begin
  if p_scope not in ('login', 'login_ip', 'password_reset', 'password_reset_ip') or p_max_attempts < 1 or p_window <= interval '0 seconds' then
    return false;
  end if;
  insert into auth_rate_limits(scope, fingerprint, attempts)
  values (p_scope, p_fingerprint, 1)
  on conflict (scope, fingerprint) do update set
    attempts = case
      when auth_rate_limits.window_started < now() - p_window then 1
      else auth_rate_limits.attempts + 1
    end,
    window_started = case
      when auth_rate_limits.window_started < now() - p_window then now()
      else auth_rate_limits.window_started
    end,
    updated_at = now()
  returning attempts into current_attempts;
  return current_attempts <= p_max_attempts;
end;
$$;
