-- 010_chat_requests.sql
-- Tracks individual chat requests for DB-backed rate limiting.
-- Stores identity (user_id or IP) and lease reference — NOT message content (PIPEDA compliance).
--
-- Three limits enforced by lib/chat-rate-limit.ts:
--   Authenticated users : 50 messages/day  ·  15 messages/hour
--   Guest users (IP)    : 10 messages/day  ·   5 messages/hour
--   Per-lease (any)     : 30 messages/day

CREATE TABLE IF NOT EXISTS chat_requests (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ip         text,
  lease_id   uuid        NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast counting for user-level daily + hourly limits
CREATE INDEX IF NOT EXISTS idx_chat_requests_user_created
  ON chat_requests(user_id, created_at)
  WHERE user_id IS NOT NULL;

-- Fast counting for IP-level daily + hourly limits
CREATE INDEX IF NOT EXISTS idx_chat_requests_ip_created
  ON chat_requests(ip, created_at)
  WHERE ip IS NOT NULL;

-- Fast counting for per-lease daily limit
CREATE INDEX IF NOT EXISTS idx_chat_requests_lease_created
  ON chat_requests(lease_id, created_at);

-- Service role only — no direct client access needed
ALTER TABLE chat_requests ENABLE ROW LEVEL SECURITY;
