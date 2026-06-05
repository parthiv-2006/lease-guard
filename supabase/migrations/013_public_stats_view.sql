-- 013_public_stats_view.sql
-- Read-only aggregate view exposing non-PII stats for the public landing page.
-- No per-lease rows, no addresses, no names — aggregates only.
-- Queried by /api/stats via service role (bypasses RLS on underlying tables).

CREATE VIEW public_stats AS
SELECT
  COUNT(DISTINCT l.id)::integer                AS total_leases_analysed,
  ROUND(AVG(r.overall_risk_score)::numeric, 1) AS avg_risk_score,
  COUNT(c.id)::integer                         AS total_clauses_analysed,
  COUNT(
    CASE WHEN c.risk_level IN ('high', 'critical')
           OR c.is_potentially_unenforceable
         THEN 1 END
  )::integer                                   AS total_red_flags
FROM leases l
JOIN reports r ON r.lease_id = l.id
LEFT JOIN clauses c ON c.lease_id = l.id
WHERE l.status = 'complete';
