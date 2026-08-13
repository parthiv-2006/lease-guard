-- 014_lease_display_title.sql
-- Optional user-supplied title override for a lease, set via the dashboard's
-- "Rename" action. NULL means "use the derived title" (property address, or
-- the uploaded filename as a fallback) as the dashboard already does.

ALTER TABLE leases ADD COLUMN display_title text;
