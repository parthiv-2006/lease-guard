-- Migration 005 — Hybrid BM25 + vector search for statute retrieval
-- ROADMAP item 2.2
--
-- Apply in: Supabase Studio → SQL Editor → paste all → Run All
--
-- What this adds:
--   1. fts_vector tsvector  — generated column on `statutes`, always in sync
--   2. idx_statutes_fts     — GIN index for fast FTS queries
--   3. search_statutes_hybrid() — drop-in replacement for search_statutes()
--      that runs BOTH pgvector cosine AND PostgreSQL FTS, then merges via
--      Reciprocal Rank Fusion (k=60) with 70/30 RRF/cosine blend.
--      Falls back gracefully to pure-vector if query_text is empty.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Full-text search generated column
-- Combines section_title + full_text so section headings AND body text are
-- searchable. STORED means Postgres computes it once and keeps it on disk.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE statutes
  ADD COLUMN IF NOT EXISTS fts_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'english',
        coalesce(section_title, '') || ' ' || coalesce(full_text, '')
      )
    ) STORED;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: GIN index — required for fast @@ operator queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_statutes_fts
  ON statutes USING GIN (fts_vector);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Hybrid search function
--
-- Parameters:
--   query_embedding  — 768-dim Gemini RETRIEVAL_QUERY embedding of the clause
--   query_text       — the raw query string for FTS (can be the same text)
--   jurisdiction     — e.g. 'CA-ON'
--   match_threshold  — minimum cosine similarity floor for vector pass (default 0.50)
--   match_count      — how many results to return (default 10)
--
-- Algorithm:
--   vec pass  → top match_count*3 rows by cosine similarity ≥ match_threshold
--   fts pass  → top match_count*3 rows by ts_rank (BM25 approximation)
--   RRF merge → score = Σ 1/(60+rank) for each result list, normalised to [0,1]
--   blend     → relevance_score = 0.7 * rrf_norm + 0.3 * cosine_score
--
-- If query_text is empty (length ≤ 2) the fts CTE returns zero rows and the
-- function degrades to pure vector search automatically.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_statutes_hybrid(
  query_embedding  vector(768),
  query_text       text,
  jurisdiction     text,
  match_threshold  float DEFAULT 0.50,
  match_count      int   DEFAULT 10
)
RETURNS TABLE (
  id             uuid,
  act_name       text,
  section_number text,
  section_title  text,
  full_text      text,
  url            text,
  corpus_version text,
  relevance_score float
)
LANGUAGE sql STABLE
AS $$
  WITH

  -- ── Vector pass (pgvector cosine similarity) ────────────────────────────────
  vec AS (
    SELECT
      s.id,
      ROW_NUMBER() OVER (ORDER BY s.embedding <=> query_embedding)  AS rnk,
      1 - (s.embedding <=> query_embedding)                         AS cosine_score
    FROM statutes s
    WHERE s.jurisdiction_code = jurisdiction
      AND s.embedding         IS NOT NULL
      AND 1 - (s.embedding <=> query_embedding) >= match_threshold
    ORDER BY s.embedding <=> query_embedding
    LIMIT match_count * 3
  ),

  -- ── FTS pass (ts_rank ≈ BM25) ───────────────────────────────────────────────
  -- plainto_tsquery tokenises plain text and ANDs terms together.
  -- Guard (length > 2) prevents executing a query on empty / whitespace input.
  fts AS (
    SELECT
      s.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(s.fts_vector, plainto_tsquery('english', query_text)) DESC
      ) AS rnk
    FROM statutes s
    WHERE s.jurisdiction_code = jurisdiction
      AND length(trim(query_text)) > 2
      AND s.fts_vector @@ plainto_tsquery('english', query_text)
    ORDER BY ts_rank(s.fts_vector, plainto_tsquery('english', query_text)) DESC
    LIMIT match_count * 3
  ),

  -- ── Reciprocal Rank Fusion ──────────────────────────────────────────────────
  -- Classic RRF: score_d = Σ_lists  1 / (k + rank_d)   where k = 60
  -- Normalise: max possible score (rank=1 in both lists) = 2 * (1/61)
  --            dividing by that gives a [0, 1] scale.
  rrf AS (
    SELECT
      COALESCE(v.id, f.id)                                  AS id,
      (  COALESCE(1.0 / (60.0 + v.rnk), 0.0)
       + COALESCE(1.0 / (60.0 + f.rnk), 0.0)
      ) * (61.0 / 2.0)                                      AS rrf_norm,  -- 0 → 1
      COALESCE(v.cosine_score, 0.0)                         AS cosine_score
    FROM vec v
    FULL OUTER JOIN fts f ON f.id = v.id
  )

  -- ── Final blend: 70 % RRF + 30 % cosine ────────────────────────────────────
  SELECT
    s.id,
    s.act_name,
    s.section_number,
    s.section_title,
    s.full_text,
    s.url,
    s.corpus_version,
    ROUND(
      (r.rrf_norm * 0.7 + r.cosine_score * 0.3)::numeric,
      4
    )::float AS relevance_score
  FROM rrf r
  JOIN statutes s ON s.id = r.id
  ORDER BY relevance_score DESC
  LIMIT match_count;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Smoke test (run after migration to verify):
--
--   SELECT section_number, section_title, relevance_score
--   FROM search_statutes_hybrid(
--     (SELECT embedding FROM statutes LIMIT 1),
--     'landlord entry written notice 24 hours',
--     'CA-ON', 0.50, 5
--   );
--
-- Expected: s.26 and s.27 rows in top 5, relevance_score > 0.7
-- ─────────────────────────────────────────────────────────────────────────────
