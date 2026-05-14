-- LeaseGuard initial schema
-- Run: supabase db push

create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ─── Enums ───────────────────────────────────────────────────────────────────

create type lease_status as enum ('pending', 'processing', 'complete', 'failed');
create type extraction_method as enum ('text', 'ocr');
create type jurisdiction_confidence as enum ('high', 'medium', 'low');
create type risk_level as enum ('low', 'medium', 'high', 'critical');
create type contradiction_type as enum ('direct_conflict', 'ambiguity', 'overlap');
create type contradiction_severity as enum ('high', 'medium', 'low');
create type negotiation_priority as enum ('high', 'medium', 'low');
create type decision_outcome as enum ('tenant_favour', 'landlord_favour', 'mixed');
create type missing_severity as enum ('critical', 'important', 'minor');

create type clause_type as enum (
  'rent_payment',
  'rent_increase',
  'security_deposit',
  'entry_rights',
  'maintenance_repairs',
  'subletting_assignment',
  'early_termination',
  'renewal_terms',
  'utilities',
  'pets',
  'alterations',
  'quiet_enjoyment',
  'liability_indemnification',
  'dispute_resolution',
  'parking_storage',
  'guest_policy',
  'standard_boilerplate',
  'unknown'
);

-- ─── Leases ──────────────────────────────────────────────────────────────────

create table leases (
  id                      uuid primary key default uuid_generate_v4(),
  uploaded_at             timestamptz not null default now(),
  user_id                 uuid,
  status                  lease_status not null default 'pending',
  jurisdiction            text,
  jurisdiction_code       text,
  jurisdiction_confidence jurisdiction_confidence,
  raw_text                text,
  file_path               text,
  page_count              integer,
  extraction_method       extraction_method,
  overall_risk_score      numeric(4,2),
  overall_risk_level      risk_level,
  corpus_version          text,
  analysis_completed_at   timestamptz,
  error_message           text
);

create index idx_leases_status on leases(status);
create index idx_leases_uploaded_at on leases(uploaded_at desc);

-- ─── Clauses ─────────────────────────────────────────────────────────────────

create table clauses (
  id                          uuid primary key default uuid_generate_v4(),
  lease_id                    uuid not null references leases(id) on delete cascade,
  clause_number               text not null,
  heading                     text,
  raw_text                    text not null,
  char_start                  integer not null,
  char_end                    integer not null,
  primary_type                clause_type not null default 'unknown',
  subtype                     text,
  classification_confidence   numeric(4,3),
  risk_score                  numeric(4,2),
  risk_level                  risk_level,
  is_potentially_unenforceable boolean not null default false,
  is_unusual                  boolean not null default false,
  is_standard                 boolean not null default false,
  plain_english_explanation   text,
  risk_reasoning              text,
  statutory_violations        jsonb,
  analysis_confidence         numeric(4,3),
  has_negotiation_point       boolean not null default false,
  cross_references            text[] not null default '{}'
);

create index idx_clauses_lease_id on clauses(lease_id);
create index idx_clauses_primary_type on clauses(primary_type);
create index idx_clauses_risk_score on clauses(risk_score desc nulls last);

-- ─── Contradictions ──────────────────────────────────────────────────────────

create table contradictions (
  id                  uuid primary key default uuid_generate_v4(),
  lease_id            uuid not null references leases(id) on delete cascade,
  clause_a_id         uuid not null references clauses(id) on delete cascade,
  clause_b_id         uuid not null references clauses(id) on delete cascade,
  contradiction_type  contradiction_type not null,
  explanation         text not null,
  which_governs       text,
  legal_basis         text,
  severity            contradiction_severity not null
);

create index idx_contradictions_lease_id on contradictions(lease_id);

-- ─── Negotiation Points ───────────────────────────────────────────────────────

create table negotiation_points (
  id                      uuid primary key default uuid_generate_v4(),
  lease_id                uuid not null references leases(id) on delete cascade,
  clause_id               uuid not null references clauses(id) on delete cascade,
  priority                negotiation_priority not null,
  negotiable              boolean not null,
  ask                     text not null,
  counter_language        text not null,
  legal_argument          text not null,
  landlord_likely_response text not null,
  tenant_rebuttal         text not null,
  walk_away_threshold     boolean not null default false,
  cited_statutes          text[] not null default '{}',
  cited_decisions         text[] not null default '{}'
);

create index idx_negotiation_points_lease_id on negotiation_points(lease_id);
create index idx_negotiation_points_priority on negotiation_points(priority);

-- ─── Tool Call Logs (agent reasoning trace) ──────────────────────────────────

create table tool_call_logs (
  id            uuid primary key default uuid_generate_v4(),
  lease_id      uuid not null references leases(id) on delete cascade,
  tool_name     text not null,
  called_at     timestamptz not null default now(),
  duration_ms   integer,
  input_summary jsonb,
  output_summary jsonb,
  success       boolean not null default true,
  error_message text,
  sequence_num  integer not null
);

create index idx_tool_call_logs_lease_id on tool_call_logs(lease_id);
create index idx_tool_call_logs_sequence on tool_call_logs(lease_id, sequence_num);

-- ─── Reports ─────────────────────────────────────────────────────────────────

create table reports (
  id                    uuid primary key default uuid_generate_v4(),
  lease_id              uuid not null unique references leases(id) on delete cascade,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default (now() + interval '90 days'),
  share_token           text unique,
  overall_risk_score    numeric(4,2) not null,
  overall_risk_level    risk_level not null,
  executive_summary     text not null,
  analysis_metadata     jsonb not null,
  full_report_json      jsonb not null
);

create index idx_reports_share_token on reports(share_token) where share_token is not null;
create index idx_reports_expires_at on reports(expires_at);
