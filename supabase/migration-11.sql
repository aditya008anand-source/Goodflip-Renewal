-- Goodflip — Migration 11
-- Run this in the Supabase SQL editor AFTER migration-10.sql has already
-- been run. Safe to re-run.
--
-- Adds:
--   leads.old_plan_price — numeric, the price of the plan the patient is
--   renewing FROM (sheet column "Old plan price", index 13 — previously
--   never parsed or stored). Shown in Patient Information on the lead
--   detail page as reference alongside the new renewal payment being
--   recorded. Null when the sheet has no value for that row.

alter table public.leads add column if not exists old_plan_price numeric(12, 2);
