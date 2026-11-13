-- MySaathi — Migration 5
-- Run this in the Supabase SQL editor AFTER migration-4.sql has already
-- been run. Safe to re-run.
--
-- Adds:
--   1. leads.lead_master_status — the sheet's own Column I value
--      ("Active" / "Inactive" / "Nutra Order"), kept separate from the
--      portal's own workflow `status` column (New/Connected/Renewed/...).
--      This only gets filled in once you re-run the Google Sheet sync after
--      this migration.
--   2. payment_categories.incentive_mode — 'simple_percentage' (the
--      existing % / fixed rule from Settings, unchanged) or
--      'target_tiered' (new — see incentive_target_tiers below). Every
--      existing category defaults to 'simple_percentage', so nothing
--      changes for Nutra/CGM/BCA/Medicine/the two Careplan sub-team
--      categories unless you explicitly switch one to target_tiered in
--      Settings.
--   3. incentive_target_tiers — the tier ladder for a target_tiered
--      category: "if a coach's lead-conversion % reaches at least X%,
--      their incentive rate on this category's revenue is Y%".

alter table public.leads add column if not exists lead_master_status text;

alter table public.payment_categories
  add column if not exists incentive_mode text not null default 'simple_percentage'
  check (incentive_mode in ('simple_percentage', 'target_tiered'));

create table if not exists public.incentive_target_tiers (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.payment_categories (id) on delete cascade,
  min_percent numeric not null,
  incentive_percent numeric not null,
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_target_tiers_category on public.incentive_target_tiers (category_id);

alter table public.incentive_target_tiers enable row level security;

-- Same admin-only-end-to-end pattern as incentive_settings.
drop policy if exists incentive_target_tiers_admin_only on public.incentive_target_tiers;
create policy incentive_target_tiers_admin_only on public.incentive_target_tiers
  for all using (public.is_admin()) with check (public.is_admin());
