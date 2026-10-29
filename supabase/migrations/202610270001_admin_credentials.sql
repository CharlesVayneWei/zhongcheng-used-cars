-- 管理员登录名、加密密码副本与口令尝试限制。
alter table public.admin_profiles add column if not exists login_name text;

with ranked as (
  select user_id, row_number() over (order by created_at, user_id) as position
  from public.admin_profiles
  where login_name is null
)
update public.admin_profiles as profile
set login_name = case when ranked.position = 1 then 'weiling' else 'admin_' || left(replace(profile.user_id::text, '-', ''), 20) end
from ranked where profile.user_id = ranked.user_id;

alter table public.admin_profiles alter column login_name set not null;
alter table public.admin_profiles add constraint admin_profiles_login_name_format
  check (login_name ~ '^[a-z][a-z0-9_-]{2,31}$');
create unique index admin_profiles_login_name_unique on public.admin_profiles (login_name);

create table public.admin_password_recovery (
  user_id uuid primary key references public.admin_profiles(user_id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_password_recovery enable row level security;
create policy "admin stores own recovery password" on public.admin_password_recovery
  for insert to authenticated with check (user_id = auth.uid() and public.is_admin());
create policy "admin reads own recovery password" on public.admin_password_recovery
  for select to authenticated using (user_id = auth.uid() and public.is_admin());
create policy "admin updates own recovery password" on public.admin_password_recovery
  for update to authenticated using (user_id = auth.uid() and public.is_admin())
  with check (user_id = auth.uid() and public.is_admin());
grant select, insert, update on public.admin_password_recovery to authenticated;

create policy "admin updates own login name" on public.admin_profiles
  for update to authenticated using (user_id = auth.uid() and public.is_admin())
  with check (user_id = auth.uid() and public.is_admin());
grant update (login_name) on public.admin_profiles to authenticated;

-- Supabase Auth 仍用邮箱验证密码；只将登录名映射到管理员邮箱。
create or replace function public.admin_email_for_login(p_login_name text)
returns text language sql stable security definer set search_path = public, auth as $$
  select users.email from public.admin_profiles as profile
  join auth.users as users on users.id = profile.user_id
  where profile.login_name = lower(trim(p_login_name)) limit 1;
$$;
revoke all on function public.admin_email_for_login(text) from public;
grant execute on function public.admin_email_for_login(text) to anon, authenticated;

-- 只返回密文；解密密钥只存在应用服务器环境变量中。
create or replace function public.admin_recovery_ciphertext(p_login_name text)
returns text language sql stable security definer set search_path = public as $$
  select recovery.ciphertext from public.admin_password_recovery as recovery
  join public.admin_profiles as profile on profile.user_id = recovery.user_id
  where profile.login_name = lower(trim(p_login_name)) limit 1;
$$;
revoke all on function public.admin_recovery_ciphertext(text) from public;
grant execute on function public.admin_recovery_ciphertext(text) to anon, authenticated;

create table public.admin_recovery_attempts (
  fingerprint text primary key,
  attempts integer not null default 0,
  window_started timestamptz not null default now()
);
alter table public.admin_recovery_attempts enable row level security;

create or replace function public.allow_admin_recovery_attempt(p_fingerprint text)
returns boolean language plpgsql security definer set search_path = public as $$
declare current_attempts integer;
begin
  if length(p_fingerprint) <> 64 then return false; end if;
  insert into public.admin_recovery_attempts(fingerprint, attempts)
  values (p_fingerprint, 1)
  on conflict (fingerprint) do update set
    attempts = case when admin_recovery_attempts.window_started < now() - interval '15 minutes'
      then 1 else admin_recovery_attempts.attempts + 1 end,
    window_started = case when admin_recovery_attempts.window_started < now() - interval '15 minutes'
      then now() else admin_recovery_attempts.window_started end
  returning attempts into current_attempts;
  return current_attempts <= 5;
end;
$$;
revoke all on function public.allow_admin_recovery_attempt(text) from public;
grant execute on function public.allow_admin_recovery_attempt(text) to anon, authenticated;
