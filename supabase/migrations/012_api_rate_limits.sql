-- 012_api_rate_limits.sql
-- Persistent, cross-instance rate limit counters for API routes.
--
-- Fixes the in-memory rate limiter (lib/rate-limiter.ts) that resets on every
-- Vercel serverless cold start, making per-IP limits trivially bypassable by
-- concurrent instances.
--
-- Used by lib/rate-limiter-db.ts via the check_and_increment_rate_limit RPC.

create table api_rate_limits (
  key        text        primary key,       -- "{ip}::{store_key}"
  count      integer     not null default 1,
  reset_at   timestamptz not null,
  updated_at timestamptz not null default now()
);

create index idx_api_rate_limits_reset_at on api_rate_limits(reset_at);

-- Atomic upsert: within the window increment the counter; after expiry reset it.
-- Returns (current_count, window_reset_at, is_allowed).
create or replace function check_and_increment_rate_limit(
  p_key          text,
  p_max_requests integer,
  p_window_ms    bigint
)
returns table(current_count integer, window_reset_at timestamptz, is_allowed boolean)
language plpgsql as $$
declare
  v_new_reset_at timestamptz;
  v_count        integer;
  v_reset_at     timestamptz;
begin
  v_new_reset_at := now() + (p_window_ms || ' milliseconds')::interval;

  insert into api_rate_limits (key, count, reset_at)
  values (p_key, 1, v_new_reset_at)
  on conflict (key) do update
    set
      count = case
        when api_rate_limits.reset_at < now() then 1
        else least(api_rate_limits.count + 1, p_max_requests + 1)
      end,
      reset_at = case
        when api_rate_limits.reset_at < now() then v_new_reset_at
        else api_rate_limits.reset_at
      end,
      updated_at = now()
  returning api_rate_limits.count, api_rate_limits.reset_at
  into v_count, v_reset_at;

  return query select v_count, v_reset_at, (v_count <= p_max_requests);
end;
$$;

-- Cleanup helper: prune expired entries to keep the table small.
-- Call periodically (e.g. once per hour from a cron or maintenance script).
create or replace function cleanup_api_rate_limits()
returns void language sql as $$
  delete from api_rate_limits where reset_at < now() - interval '1 hour';
$$;
