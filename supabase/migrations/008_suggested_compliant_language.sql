-- Migration 008: Add suggested_compliant_language to clauses table
-- This field stores a template of compliant language for each flagged clause,
-- generated deterministically by score-risk.ts based on the violation type.

alter table clauses
  add column if not exists suggested_compliant_language text;
