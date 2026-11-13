-- MySaathi — Migration 6
-- Run this in the Supabase SQL editor AFTER migration-5.sql has already
-- been run. Safe to re-run.
--
-- Adds:
--   1. incentive_settings.month_cohort / incentive_target_tiers.month_cohort
--      — set a rule/tier for ONE specific month (e.g. '2026-11') so changing
--      it never touches any other month's already-calculated numbers. Leave
--      blank (NULL) for a "default" rule that applies to any month that
--      doesn't have its own month-specific rule — this is what every
--      existing row already does, so nothing already configured changes
--      behaviour.
--   2. incentive_target_tiers.target_type ('percentage' or 'count') — a
--      target-tiered category's ladder can be defined either as "% of this
--      coach's own Active leads converted" (the original Careplan example)
--      or as a flat "number of conversions", per month.
--   3. incentive_target_tiers.min_percent renamed to min_value (it now
--      means either a % or a raw count depending on target_type).

alter table public.incentive_settings add column if not exists month_cohort text;
alter table public.incentive_target_tiers add column if not exists month_cohort text;

alter table public.incentive_target_tiers
  add column if not exists target_type text not null default 'percentage'
  check (target_type in ('percentage', 'count'));

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'incentive_target_tiers' and column_name = 'min_percent'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'incentive_target_tiers' and column_name = 'min_value'
  ) then
    alter table public.incentive_target_tiers rename column min_percent to min_value;
  end if;
end $$;
