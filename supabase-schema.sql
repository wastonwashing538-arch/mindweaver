-- ============================================================
-- MindWeaver — Supabase Database Schema
-- 在 Supabase 控制台的 SQL Editor 中运行此文件（一次性）
-- ============================================================


-- 1. Conversations（对话数据）
-- ============================================================
create table if not exists conversations (
  id            uuid        primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  title         text        not null default '新对话',
  project_state jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists conversations_user_id_updated_at_idx
  on conversations(user_id, updated_at desc);

alter table conversations enable row level security;

create policy "Users can manage their own conversations"
  on conversations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 2. Token Usage（每次 AI 调用的 token 消耗记录）
-- ============================================================
create table if not exists token_usage (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  conversation_id   uuid        references conversations(id) on delete set null,
  prompt_tokens     int         not null default 0,
  completion_tokens int         not null default 0,
  total_tokens      int         not null default 0,
  model             text        not null default 'deepseek-chat',
  created_at        timestamptz not null default now()
);

create index if not exists token_usage_user_id_created_at_idx
  on token_usage(user_id, created_at desc);

alter table token_usage enable row level security;

-- 用户可以读取和插入自己的用量记录
create policy "Users can view their own token usage"
  on token_usage for select
  using (auth.uid() = user_id);

create policy "Users can insert their own token usage"
  on token_usage for insert
  with check (auth.uid() = user_id);


-- 3. User Quota（用户配额，每人一行）
-- ============================================================
create table if not exists user_quota (
  user_id              uuid        primary key references auth.users(id) on delete cascade,
  tier                 text        not null default 'free',    -- 'free' | 'pro'
  monthly_token_limit  int         not null default 100000,    -- 免费版：10万 tokens/月
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table user_quota enable row level security;

-- 用户可以读取自己的配额（管理员通过 service role 修改）
create policy "Users can view their own quota"
  on user_quota for select
  using (auth.uid() = user_id);


-- 4. 新用户注册时自动初始化配额（触发器）
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.user_quota (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
