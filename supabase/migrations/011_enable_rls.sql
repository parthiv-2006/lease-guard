-- 011_enable_rls.sql
-- Enable Row Level Security on all user-data tables.
--
-- All API routes use service_role (bypasses RLS) so existing behaviour is
-- unchanged.  These policies close the gap where a caller with the public
-- NEXT_PUBLIC_SUPABASE_ANON_KEY could query the PostgREST REST API directly
-- and read/write any row without going through the API layer.
--
-- Design:
--   • Corpus tables (statutes, tribunal_decisions, clause_comparisons) –
--     anon SELECT allowed (Ontario public legal reference data, no PII).
--   • User-data tables – no anon access at all; authenticated users can only
--     touch rows that belong to them (user_id = auth.uid()).
--   • report_feedback – insert allowed to anyone (guests need to submit), but
--     reads restricted to the lease owner.

-- ─── User data tables ────────────────────────────────────────────────────────

alter table leases              enable row level security;
alter table clauses             enable row level security;
alter table reports             enable row level security;
alter table contradictions      enable row level security;
alter table negotiation_points  enable row level security;
alter table tool_call_logs      enable row level security;
alter table report_feedback     enable row level security;

-- leases: auth users see only their own rows
create policy "auth_users_own_leases"
  on leases for all
  using (auth.uid() is not null and user_id = auth.uid());

-- clauses: accessible when the parent lease belongs to the auth user
create policy "auth_users_own_clauses"
  on clauses for all
  using (
    auth.uid() is not null and
    exists (
      select 1 from leases l
      where l.id = clauses.lease_id
        and l.user_id = auth.uid()
    )
  );

-- reports: accessible when the parent lease belongs to the auth user
create policy "auth_users_own_reports"
  on reports for all
  using (
    auth.uid() is not null and
    exists (
      select 1 from leases l
      where l.id = reports.lease_id
        and l.user_id = auth.uid()
    )
  );

-- contradictions
create policy "auth_users_own_contradictions"
  on contradictions for all
  using (
    auth.uid() is not null and
    exists (
      select 1 from leases l
      where l.id = contradictions.lease_id
        and l.user_id = auth.uid()
    )
  );

-- negotiation_points
create policy "auth_users_own_negotiation_points"
  on negotiation_points for all
  using (
    auth.uid() is not null and
    exists (
      select 1 from leases l
      where l.id = negotiation_points.lease_id
        and l.user_id = auth.uid()
    )
  );

-- tool_call_logs
create policy "auth_users_own_tool_call_logs"
  on tool_call_logs for all
  using (
    auth.uid() is not null and
    exists (
      select 1 from leases l
      where l.id = tool_call_logs.lease_id
        and l.user_id = auth.uid()
    )
  );

-- report_feedback: anyone can insert (guest or auth), only lease owner can read
create policy "anyone_can_insert_feedback"
  on report_feedback for insert
  with check (true);

create policy "auth_users_read_own_feedback"
  on report_feedback for select
  using (
    auth.uid() is not null and
    exists (
      select 1 from leases l
      where l.id = report_feedback.lease_id
        and l.user_id = auth.uid()
    )
  );

-- ─── Corpus tables: read-only for anon ───────────────────────────────────────

alter table statutes            enable row level security;
alter table tribunal_decisions  enable row level security;
alter table clause_comparisons  enable row level security;

create policy "anon_read_statutes"
  on statutes for select
  using (true);

create policy "anon_read_tribunal_decisions"
  on tribunal_decisions for select
  using (true);

create policy "anon_read_clause_comparisons"
  on clause_comparisons for select
  using (true);
