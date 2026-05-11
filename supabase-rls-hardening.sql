-- ============================================================
-- MindWeaver — RLS Hardening（在 Supabase SQL Editor 中运行）
-- ============================================================

-- 1. updated_at 自动触发器（服务端时间，不依赖客户端）
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on conversations;
create trigger conversations_set_updated_at
  before update on conversations
  for each row execute procedure public.set_updated_at();

drop trigger if exists user_quota_set_updated_at on user_quota;
create trigger user_quota_set_updated_at
  before update on user_quota
  for each row execute procedure public.set_updated_at();


-- 2. token_usage 禁止 UPDATE/DELETE（记录不可篡改）
-- ============================================================
revoke update, delete on token_usage from authenticated;


-- 3. 加固 conversations INSERT 策略（防止伪造 user_id）
-- 注：原有 "for all" 策略已包含 with check，但拆开更清晰可审计
-- ============================================================
drop policy if exists "Users can manage their own conversations" on conversations;

create policy "conversations_select" on conversations
  for select using (auth.uid() = user_id);

create policy "conversations_insert" on conversations
  for insert with check (auth.uid() = user_id);

create policy "conversations_update" on conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "conversations_delete" on conversations
  for delete using (auth.uid() = user_id);
