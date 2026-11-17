-- Goodflip — Migration 2
-- Run this in the Supabase SQL editor AFTER schema.sql and policies.sql have
-- already been run once. Safe to re-run (every statement is guarded).
--
-- Adds:
--   1. payment_categories (Product: CGM/BCA/Nutra, Service: Careplan sub-teams)
--      + admin can add more from the Settings page — no code change needed.
--   2. payments.category_id / incentive_settings.category_id — incentive
--      rules are now matched by category instead of the free-text programme.
--   3. users.is_super_admin — exactly one account should ever have this set
--      to true (see the UPDATE statement at the bottom of this file).

-- ---------------------------------------------------------------------------
-- 1. Payment categories
-- ---------------------------------------------------------------------------
create table if not exists public.payment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('product', 'service')),
  team_subcategory text, -- e.g. 'Field', 'Inside Sales' — only meaningful for kind='service'
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.payment_categories (name, kind, team_subcategory) values
  ('CGM', 'product', null),
  ('BCA', 'product', null),
  ('Nutra', 'product', null),
  ('Careplan - Coach + Field', 'service', 'Field'),
  ('Careplan - Coach + Inside Sales', 'service', 'Inside Sales')
on conflict (name) do nothing;

alter table public.payment_categories enable row level security;

drop policy if exists payment_categories_select on public.payment_categories;
create policy payment_categories_select on public.payment_categories
  for select using (true); -- every signed-in user needs this list to log a payment

drop policy if exists payment_categories_admin_insert on public.payment_categories;
create policy payment_categories_admin_insert on public.payment_categories
  for insert with check (public.is_admin());

drop policy if exists payment_categories_admin_update on public.payment_categories;
create policy payment_categories_admin_update on public.payment_categories
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Link payments / incentive rules to a category
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists category_id uuid references public.payment_categories (id);
alter table public.incentive_settings add column if not exists category_id uuid references public.payment_categories (id);

-- ---------------------------------------------------------------------------
-- 3. Super admin — one protected account that can remove other users and
--    can never be removed or demoted by anyone, including other admins.
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists is_super_admin boolean not null default false;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and is_super_admin = true
  );
$$;

-- Blocks removing/demoting a super admin through ANY update (app, SQL
-- editor with the anon/service key, everything) — the only way this flag
-- is ever set is the one-off UPDATE at the bottom of this file, run by hand.
create or replace function public.protect_super_admin()
returns trigger
language plpgsql
as $$
begin
  if old.is_super_admin = true and new.is_super_admin is distinct from true then
    raise exception 'Cannot remove super admin status.';
  end if;
  if old.is_super_admin = true and new.role <> old.role then
    raise exception 'Cannot change the super admin role.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_super_admin_trigger on public.users;
create trigger protect_super_admin_trigger
  before update on public.users
  for each row execute procedure public.protect_super_admin();

-- Blocks deleting a super admin's row even if someone deletes the
-- underlying auth.users account (which would otherwise cascade-delete this row).
create or replace function public.protect_super_admin_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_super_admin = true then
    raise exception 'Cannot delete the super admin account.';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_super_admin_delete_trigger on public.users;
create trigger protect_super_admin_delete_trigger
  before delete on public.users
  for each row execute procedure public.protect_super_admin_delete();

-- ---------------------------------------------------------------------------
-- RUN THIS ONE LINE YOURSELF, once, after everything above — replace the
-- email with your own login email. This is the only way is_super_admin ever
-- gets set to true; after this, the triggers above stop anyone (including
-- you from another account) from ever undoing it.
-- ---------------------------------------------------------------------------
-- update public.users set is_super_admin = true where email = 'YOUR-LOGIN-EMAIL-HERE';
