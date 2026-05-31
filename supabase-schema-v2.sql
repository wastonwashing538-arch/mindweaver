-- MindWeaver Schema v2
-- Run this in Supabase SQL Editor
-- Adds: ai_models table (Task D) + user_quota count columns (Task E)

-- ─────────────────────────── Task D: AI Models Table ─────────────────────────

CREATE TABLE IF NOT EXISTS ai_models (
  id              TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  relay_model_id  TEXT NOT NULL,       -- actual model ID sent to relay provider
  tier_required   TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'vip'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  description     TEXT
);

-- Default models (adjust relay_model_id to match your actual relay provider)
INSERT INTO ai_models (id, display_name, relay_model_id, tier_required, sort_order, description) VALUES
  ('deepseek-r1',       'DeepSeek R1',       'deepseek-chat',              'free', 1, '免费用户专属，深度推理'),
  ('claude-3.5-sonnet', 'Claude 3.5 Sonnet', 'claude-3-5-sonnet-20241022', 'vip',  2, '强大的综合能力'),
  ('gpt-4o',            'GPT-4o',            'gpt-4o',                     'vip',  3, 'OpenAI 旗舰模型'),
  ('gemini-2.0-flash',  'Gemini 2.0 Flash',  'gemini-2.0-flash',           'vip',  4, '速度极快')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────── Task E: user_quota Count Columns ────────────────

ALTER TABLE user_quota
  ADD COLUMN IF NOT EXISTS chat_count_daily_used    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chat_count_daily_limit   INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS daily_reset_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chat_count_monthly_used  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chat_count_monthly_limit INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_reset_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creem_customer_id        TEXT,
  ADD COLUMN IF NOT EXISTS creem_subscription_id    TEXT,
  ADD COLUMN IF NOT EXISTS subscription_expires_at  TIMESTAMPTZ;

-- ─────────────────────────── Beta User Support ───────────────────────────────
-- Run this to enable the beta waitlist mechanism

ALTER TABLE user_quota
  ADD COLUMN IF NOT EXISTS is_beta_user BOOLEAN NOT NULL DEFAULT false;

-- Index for fast beta count queries
CREATE INDEX IF NOT EXISTS idx_user_quota_is_beta_user ON user_quota(is_beta_user) WHERE is_beta_user = true;

-- ─────────────────────────── Atomic increment function ───────────────────────
-- Atomic increment function (handles daily reset in one SQL statement)
CREATE OR REPLACE FUNCTION increment_chat_count(uid UUID, is_vip BOOLEAN)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  today_start TIMESTAMPTZ := date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai');
  month_start TIMESTAMPTZ := date_trunc('month', NOW() AT TIME ZONE 'Asia/Shanghai');
BEGIN
  IF NOT is_vip THEN
    UPDATE user_quota SET
      chat_count_daily_used = CASE
        WHEN daily_reset_at IS NULL OR daily_reset_at < today_start THEN 1
        ELSE chat_count_daily_used + 1
      END,
      daily_reset_at = CASE
        WHEN daily_reset_at IS NULL OR daily_reset_at < today_start THEN today_start
        ELSE daily_reset_at
      END
    WHERE user_id = uid;
  ELSE
    UPDATE user_quota SET
      chat_count_monthly_used = CASE
        WHEN monthly_reset_at IS NULL OR monthly_reset_at < month_start THEN 1
        ELSE chat_count_monthly_used + 1
      END,
      monthly_reset_at = CASE
        WHEN monthly_reset_at IS NULL OR monthly_reset_at < month_start THEN month_start
        ELSE monthly_reset_at
      END
    WHERE user_id = uid;
  END IF;
END;
$$;
