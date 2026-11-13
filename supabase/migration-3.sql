-- MySaathi — Migration 3
-- Run this in the Supabase SQL editor AFTER migration-2.sql has already
-- been run. Safe to re-run.
--
-- Adds:
--   1. Payment verification — a payment a coach records starts as
--      "pending"; only someone with Verify Access (or the super admin) can
--      mark it verified/rejected. Revenue & Incentives only counts verified
--      payments.
--   2. users.can_verify_payments — a permission flag, separate from the
--      admin/coach role, so NOT every admin can verify payments — only
--      people the super admin specifically grants this to.

-- ---------------------------------------------------------------------------
-- 1. Verify-access permission flag
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists can_verify_payments boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Payment verification fields
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending', 'verified', 'rejected'));
alter table public.payments add column if not exists verified_by uuid references public.users (id);
alter table public.payments add column if not exists verified_at timestamptz;
alter table public.payments add column if not exists verification_note text;

-- Helper: can the current user verify payments? (super admin always can)
create or replace function public.can_verify_payments()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and (is_super_admin = true or can_verify_payments = true)
  );
$$;

-- payments previously had NO update policy at all (append-only history).
-- This adds the one controlled exception: only someone with verify access
-- can update a payment row, and the app only ever changes the verification_*
-- columns through this path (src/app/(dashboard)/leads/[id]/actions.ts).
drop policy if exists payments_verify_update on public.payments;
create policy payments_verify_update on public.payments
  for update using (public.can_verify_payments())
  with check (public.can_verify_payments());
