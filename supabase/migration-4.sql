-- Goodflip — Migration 4
-- Run this in the Supabase SQL editor AFTER migration-3.sql has already
-- been run. Safe to re-run.
--
-- Adds:
--   1. Order fulfillment on a payment — Order ID / tracking link, and a
--      "Plan Assigned" confirmation, for the supply team to fill in once a
--      Product payment is verified.
--   2. users.can_manage_orders — a permission flag (like can_verify_payments)
--      so only people the super admin grants this to (the "supply team")
--      can fill these in, not every admin automatically.

alter table public.users add column if not exists can_manage_orders boolean not null default false;

alter table public.payments add column if not exists order_id text;
alter table public.payments add column if not exists tracking_link text;
alter table public.payments add column if not exists plan_assigned boolean not null default false;
alter table public.payments add column if not exists order_updated_by uuid references public.users (id);
alter table public.payments add column if not exists order_updated_at timestamptz;

create or replace function public.can_manage_orders()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and (is_super_admin = true or role = 'admin' or can_manage_orders = true)
  );
$$;

-- Second controlled exception to payments' append-only rule (alongside
-- payments_verify_update from migration-3.sql) — only lets someone with
-- order access update a row, and the app only ever touches the order_*
-- columns through this path (src/app/(dashboard)/orders/actions.ts).
drop policy if exists payments_order_update on public.payments;
create policy payments_order_update on public.payments
  for update using (public.can_manage_orders())
  with check (public.can_manage_orders());

-- A supply-team member can be a plain Coach granted Order Access — they
-- still need to SEE every lead/payment to fulfill orders, not just their
-- own assigned leads, so these two SELECT policies (originally from
-- policies.sql) are redefined here to also allow can_manage_orders().
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select using (
    public.is_admin()
    or coach_id = public.current_coach_id()
    or public.can_manage_orders()
  );

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (public.is_admin() or l.coach_id = public.current_coach_id() or public.can_manage_orders())
    )
  );
