-- MySaathi — Migration 9
-- Run this in the Supabase SQL editor AFTER migration-8.sql has already
-- been run. Safe to re-run.
--
-- Adds:
--   payment_categories.target_group — an optional label. Categories that
--   share the same non-null target_group are pooled together for
--   target-tiered achievement/incentive purposes (revenue.page.tsx groups
--   by this), while staying separate, independently-taggable categories
--   everywhere else (Record Payment dropdown, Revenue-by-category
--   breakdown). A category with target_group = NULL behaves exactly as
--   before — this is fully backward compatible for every existing
--   category that isn't Careplan.
--
--   The 3 existing Careplan categories (plain "Careplan", "Careplan -
--   Coach + Field", "Careplan - Coach + Inside Sales") all currently use
--   the same active-patient-count criteria, so they're grouped together
--   here under 'careplan'. Only configure the tier ladder (in Settings)
--   on ONE of the three going forward — the other two can be left with no
--   ladder of their own; the group's achievement % is computed from all
--   three categories' payments combined, divided once by the coach's
--   Active leads, so it no longer matters which of the three a coach's
--   payment gets tagged with.

alter table public.payment_categories add column if not exists target_group text;

update public.payment_categories
set target_group = 'careplan'
where id in (
  '4fbdae40-5b7b-4318-9d10-572648e5fa67', -- Careplan
  '04cdd25e-0d0a-4874-ad91-a3005e9e526b', -- Careplan - Coach + Field
  '80254ea1-ec52-4c01-808e-9885b31ee79c'  -- Careplan - Coach + Inside Sales
);
