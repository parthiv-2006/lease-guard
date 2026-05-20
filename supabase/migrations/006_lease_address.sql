-- Migration 006: add property address columns to leases table
--
-- Stores the rental unit address extracted from the PDF during analysis.
-- All columns nullable — extraction may fail for non-standard lease formats.
-- The agent populates these in the step-5 DB update after jurisdiction detection.

alter table leases
  add column if not exists property_address     text,   -- street number + street name (e.g. "123 Main Street")
  add column if not exists property_unit        text,   -- unit/apt number (e.g. "Apt 4", "Unit 2B")
  add column if not exists property_city        text,   -- municipality (e.g. "Toronto")
  add column if not exists property_postal_code text;   -- postal code (e.g. "M5V 1A1")

comment on column leases.property_address     is 'Street address extracted from the lease PDF';
comment on column leases.property_unit        is 'Unit/apartment number extracted from the lease PDF';
comment on column leases.property_city        is 'City/municipality extracted from the lease PDF';
comment on column leases.property_postal_code is 'Postal code extracted from the lease PDF';
