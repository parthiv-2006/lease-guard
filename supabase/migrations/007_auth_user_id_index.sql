-- Migration 007: Index on leases.user_id for fast dashboard queries
-- leases.user_id already exists as a nullable column (added in migration 001).
-- This migration adds the btree index to make per-user queries efficient.

create index if not exists leases_user_id_idx
  on leases (user_id)
  where user_id is not null;
