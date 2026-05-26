-- Add upload_ip column to leases for DB-backed per-IP rate limiting.
-- Allows reliable counting of uploads per IP/user across serverless instances.

ALTER TABLE leases ADD COLUMN IF NOT EXISTS upload_ip text;

-- Index for fast per-IP rate limit queries (count uploads in last 24h)
CREATE INDEX IF NOT EXISTS idx_leases_upload_ip_uploaded_at
  ON leases(upload_ip, uploaded_at)
  WHERE upload_ip IS NOT NULL;

-- Composite index for per-user rate limit queries
CREATE INDEX IF NOT EXISTS idx_leases_user_id_uploaded_at
  ON leases(user_id, uploaded_at)
  WHERE user_id IS NOT NULL;
