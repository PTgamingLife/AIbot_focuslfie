-- focuslife (fl_) LINE OA：資料表與伺服器端 Secret 讀取
-- 所有表開 RLS 且不建 policy → 只有 service_role（Edge Function）可讀寫

create table if not exists public.fl_users (
  line_user_id text primary key,
  display_name text,
  picture_url text,
  followed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fl_health_reports (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null references public.fl_users(line_user_id) on delete cascade,
  total int not null check (total between 0 and 100),
  breakdown jsonb not null,
  ai_raw jsonb not null,
  ai_total numeric,
  summary text,
  tasks jsonb,
  created_at timestamptz not null default now()
);
create index if not exists fl_health_reports_user_idx on public.fl_health_reports(line_user_id, created_at desc);

create table if not exists public.fl_finance_results (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null references public.fl_users(line_user_id) on delete cascade,
  answers jsonb not null,
  scores jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists fl_finance_results_user_idx on public.fl_finance_results(line_user_id, created_at desc);

create table if not exists public.fl_profiles (
  line_user_id text primary key references public.fl_users(line_user_id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.fl_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fl_users enable row level security;
alter table public.fl_health_reports enable row level security;
alter table public.fl_finance_results enable row level security;
alter table public.fl_profiles enable row level security;
alter table public.fl_settings enable row level security;

-- 一次性管理 token 只存 SHA-256（用於 fl-setup-richmenu）
insert into public.fl_settings(key, value)
values ('admin_token_sha256', to_jsonb('5292cc1ba9d4056139dec45f22fcda9de3defaf99f06cbf446efc415f1e08bf3'::text))
on conflict (key) do nothing;

-- 從 Vault 取 focuslife 專案的 Secret；只授權 service_role
create or replace function public.fl_get_secret(p_kind text)
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from public.facialmonitor_mcp_secret_refs r
  join vault.decrypted_secrets ds on ds.id = r.vault_secret_id
  where r.project_id = '492e0072-b4bb-4fbd-b517-c533837c2648'::uuid
    and r.secret_kind = p_kind
    and p_kind in ('ai_api_key', 'line_channel_secret', 'line_access_token')
  order by r.updated_at desc
  limit 1;
$$;

revoke all on function public.fl_get_secret(text) from public, anon, authenticated;
grant execute on function public.fl_get_secret(text) to service_role;
