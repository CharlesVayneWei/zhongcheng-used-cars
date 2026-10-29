-- 二手车展示与管理平台 V1.0
-- 在 Supabase SQL Editor 或 `supabase db push` 中执行。

create extension if not exists pgcrypto;

create type public.car_status as enum ('draft', 'published', 'sold', 'archived');
create type public.insurance_status as enum ('insured', 'uninsured', 'unknown');

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.cars (
  id uuid primary key default gen_random_uuid(),
  title text,
  brand text,
  model text,
  registration_year integer,
  registration_province text,
  registration_city text,
  insurance_status public.insurance_status not null default 'unknown',
  insurance_expiry date,
  mileage_km bigint,
  cash_price_yuan bigint,
  installment_price_yuan bigint,
  down_payment_yuan bigint,
  condition_description text,
  status public.car_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
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

create table public.car_images (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  storage_path text not null unique,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 5242880),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index car_images_one_cover_per_car
  on public.car_images(car_id) where is_cover;
create index car_images_car_sort_idx on public.car_images(car_id, sort_order);
create index cars_public_listing_idx on public.cars(status, published_at desc);
create index cars_filters_idx on public.cars(brand, registration_year, cash_price_yuan, mileage_km);

create table public.site_settings (
  id boolean primary key default true check (id),
  site_name text not null default '众成精品车行',
  tagline text not null default '真实车源，透明信息',
  consultation_phone text,
  consultation_wechat text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.site_settings (id) values (true) on conflict (id) do nothing;

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.storage_cleanup_queue (
  storage_path text primary key,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cars_set_updated_at before update on public.cars
for each row execute function public.set_updated_at();
create trigger site_settings_set_updated_at before update on public.site_settings
for each row execute function public.set_updated_at();
create trigger cleanup_queue_set_updated_at before update on public.storage_cleanup_queue
for each row execute function public.set_updated_at();

create or replace function public.ensure_car_has_image_before_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('published', 'sold') and
     not exists (select 1 from public.car_images where car_id = new.id) then
    raise exception '发布或标记已售前至少需要一张车辆图片';
  end if;
  return new;
end;
$$;

create constraint trigger cars_require_image_to_publish
after insert or update of status on public.cars
deferrable initially immediate
for each row execute function public.ensure_car_has_image_before_publish();

create or replace function public.prevent_last_public_image_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.cars where id = old.car_id and status in ('published', 'sold')) and
     not exists (select 1 from public.car_images where car_id = old.car_id and id <> old.id) then
    raise exception '在售或已售车辆必须保留至少一张图片';
  end if;
  return old;
end;
$$;

create trigger car_images_keep_last_public
before delete on public.car_images
for each row execute function public.prevent_last_public_image_delete();

create or replace function public.set_car_cover_image(p_car_id uuid, p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.car_images where id = p_image_id and car_id = p_car_id) then
    raise exception 'image_not_found';
  end if;
  update public.car_images set is_cover = false where car_id = p_car_id and is_cover;
  update public.car_images set is_cover = true where id = p_image_id and car_id = p_car_id;
end;
$$;

revoke all on function public.set_car_cover_image(uuid, uuid) from public;
grant execute on function public.set_car_cover_image(uuid, uuid) to authenticated;

-- 先在同一事务中转为下架，再删除车辆。这样级联删除图片时不会触发
-- “公开车辆至少保留一张图片”的保护规则，也不会产生半删除状态。
create or replace function public.delete_car_record(p_car_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.cars set status = 'archived' where id = p_car_id;
  if not found then raise exception 'car_not_found'; end if;
  delete from public.cars where id = p_car_id;
end;
$$;

revoke all on function public.delete_car_record(uuid) from public;
grant execute on function public.delete_car_record(uuid) to authenticated;

alter table public.admin_profiles enable row level security;
alter table public.cars enable row level security;
alter table public.car_images enable row level security;
alter table public.site_settings enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.storage_cleanup_queue enable row level security;

create policy "admin profile owner read" on public.admin_profiles
for select to authenticated using (user_id = auth.uid());

create policy "public cars read" on public.cars
for select to anon, authenticated using (status in ('published', 'sold'));
create policy "admins read all cars" on public.cars
for select to authenticated using (public.is_admin());
create policy "admins insert cars" on public.cars
for insert to authenticated with check (public.is_admin());
create policy "admins update cars" on public.cars
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete cars" on public.cars
for delete to authenticated using (public.is_admin());

create policy "public car images read" on public.car_images
for select to anon, authenticated using (
  exists (select 1 from public.cars where cars.id = car_images.car_id and cars.status in ('published', 'sold'))
);
create policy "admins read all car images" on public.car_images
for select to authenticated using (public.is_admin());
create policy "admins insert car images" on public.car_images
for insert to authenticated with check (public.is_admin());
create policy "admins update car images" on public.car_images
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete car images" on public.car_images
for delete to authenticated using (public.is_admin());

create policy "public settings read" on public.site_settings
for select to anon, authenticated using (true);
create policy "admins update settings" on public.site_settings
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins insert audit" on public.admin_audit_logs
for insert to authenticated with check (public.is_admin() and user_id = auth.uid());
create policy "admins read audit" on public.admin_audit_logs
for select to authenticated using (public.is_admin());

create policy "admins manage cleanup queue" on public.storage_cleanup_queue
for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-images', 'car-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public vehicle image read" on storage.objects
for select to anon, authenticated using (bucket_id = 'car-images');
create policy "admins upload vehicle images" on storage.objects
for insert to authenticated with check (
  bucket_id = 'car-images' and public.is_admin() and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);
create policy "admins update vehicle images" on storage.objects
for update to authenticated using (bucket_id = 'car-images' and public.is_admin())
with check (bucket_id = 'car-images' and public.is_admin());
create policy "admins delete vehicle images" on storage.objects
for delete to authenticated using (bucket_id = 'car-images' and public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.cars, public.car_images, public.site_settings to anon;
grant select, insert, update, delete on public.cars, public.car_images, public.site_settings to authenticated;
grant select on public.admin_profiles to authenticated;
grant select, insert on public.admin_audit_logs to authenticated;
grant select, insert, update, delete on public.storage_cleanup_queue to authenticated;
