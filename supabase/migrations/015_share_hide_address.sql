-- 015_share_hide_address.sql
-- Optional per-report flag: when true, the property address is redacted for
-- anyone viewing the report through its share link (owner viewing directly,
-- without a share token, always sees the real address).

ALTER TABLE reports ADD COLUMN share_hide_address boolean NOT NULL DEFAULT false;
