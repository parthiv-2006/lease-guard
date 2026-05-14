-- LeaseGuard corpus tables (statutes, decisions, benchmark)
-- Requires pgvector extension (enabled in 001)

-- ─── Statute Corpus ───────────────────────────────────────────────────────────

create table statutes (
  id                uuid primary key default uuid_generate_v4(),
  jurisdiction_code text not null,
  act_name          text not null,
  section_number    text not null,
  section_title     text not null,
  full_text         text not null,
  url               text not null,
  embedding         vector(768),
  relevant_clause_types clause_type[] not null default '{}',
  embedded_at       timestamptz,
  corpus_version    text not null,
  unique (jurisdiction_code, act_name, section_number)
);

create index idx_statutes_jurisdiction on statutes(jurisdiction_code);
create index idx_statutes_clause_types on statutes using gin(relevant_clause_types);

-- ivfflat index for ANN search (requires at least 100 rows to be useful)
-- create index idx_statutes_embedding on statutes
--   using ivfflat (embedding vector_cosine_ops) with (lists = 50);
-- Uncomment after corpus is loaded (ivfflat needs data to build)

-- ─── Tribunal Decisions Corpus ───────────────────────────────────────────────

create table tribunal_decisions (
  id                      uuid primary key default uuid_generate_v4(),
  jurisdiction_code       text not null,
  tribunal                text not null,
  case_number             text not null unique,
  decision_date           date not null,
  ruling_summary          text not null,
  outcome                 decision_outcome not null,
  relevant_principle      text not null,
  relevant_clause_types   clause_type[] not null default '{}',
  url                     text not null,
  embedding               vector(768),
  embedded_at             timestamptz,
  corpus_version          text not null
);

create index idx_decisions_jurisdiction on tribunal_decisions(jurisdiction_code);
create index idx_decisions_clause_types on tribunal_decisions using gin(relevant_clause_types);
create index idx_decisions_date on tribunal_decisions(decision_date desc);

-- create index idx_decisions_embedding on tribunal_decisions
--   using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- ─── Benchmark Corpus ────────────────────────────────────────────────────────

create table clause_comparisons (
  id                uuid primary key default uuid_generate_v4(),
  clause_type       clause_type not null,
  anonymized_text   text not null,
  risk_score        numeric(4,2) not null,
  jurisdiction_code text not null,
  analyzed_at       timestamptz not null default now(),
  embedding         vector(768),
  is_seed_data      boolean not null default false
);

create index idx_comparisons_clause_type on clause_comparisons(clause_type);
create index idx_comparisons_jurisdiction on clause_comparisons(jurisdiction_code);
create index idx_comparisons_risk_score on clause_comparisons(risk_score);

-- create index idx_comparisons_embedding on clause_comparisons
--   using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- ─── Corpus Version Tracking ─────────────────────────────────────────────────

create table corpus_versions (
  id              uuid primary key default uuid_generate_v4(),
  version         text not null unique,
  built_at        timestamptz not null default now(),
  statute_count   integer not null default 0,
  decision_count  integer not null default 0,
  notes           text
);

insert into corpus_versions (version, notes)
values ('2026-05-14', 'Initial corpus version');

-- ─── Utility: Statute Semantic Search Function ────────────────────────────────

create or replace function search_statutes(
  query_embedding vector(768),
  jurisdiction    text,
  match_threshold float default 0.45,
  match_count     int default 3
)
returns table (
  id                uuid,
  act_name          text,
  section_number    text,
  section_title     text,
  full_text         text,
  url               text,
  corpus_version    text,
  relevance_score   float
)
language sql stable
as $$
  select
    s.id,
    s.act_name,
    s.section_number,
    s.section_title,
    s.full_text,
    s.url,
    s.corpus_version,
    1 - (s.embedding <=> query_embedding) as relevance_score
  from statutes s
  where s.jurisdiction_code = jurisdiction
    and s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) >= match_threshold
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

-- ─── Utility: Decision Semantic Search Function ───────────────────────────────

create or replace function search_decisions(
  query_embedding vector(768),
  jurisdiction    text,
  match_threshold float default 0.45,
  match_count     int default 3
)
returns table (
  id                uuid,
  case_number       text,
  decision_date     date,
  ruling_summary    text,
  outcome           decision_outcome,
  relevant_principle text,
  url               text,
  relevance_score   float
)
language sql stable
as $$
  select
    d.id,
    d.case_number,
    d.decision_date,
    d.ruling_summary,
    d.outcome,
    d.relevant_principle,
    d.url,
    1 - (d.embedding <=> query_embedding) as relevance_score
  from tribunal_decisions d
  where d.jurisdiction_code = jurisdiction
    and d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) >= match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
