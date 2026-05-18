-- Add optional min_decision_date parameter to search_decisions.
-- The MCP lookup-tribunal tool passes this param when filtering to last 5 years.
-- Dropping and recreating is required because PostgreSQL considers a function
-- with a different parameter list to be a different overload.

drop function if exists search_decisions(vector, text, float, int);

create or replace function search_decisions(
  query_embedding  vector(768),
  jurisdiction     text,
  match_threshold  float    default 0.45,
  match_count      int      default 3,
  min_decision_date date    default null
)
returns table (
  id                 uuid,
  case_number        text,
  decision_date      date,
  ruling_summary     text,
  outcome            decision_outcome,
  relevant_principle text,
  url                text,
  relevance_score    float
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
    and (min_decision_date is null or d.decision_date >= min_decision_date)
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
