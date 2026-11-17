-- Goodflip — Migration 7
-- Run this in the Supabase SQL editor AFTER migration-6.sql has already
-- been run. Safe to re-run.
--
-- Adds a gate for self-service signups. A coach an admin invites directly
-- (via the Settings "Generate invite link" flow) stays auto-approved exactly
-- as before — nothing changes for that path. Only an account created through
-- the new public /join self-signup page starts out UNapproved: they can
-- create their login, but can't actually sign in until an admin approves
-- them from Settings.

alter table public.users add column if not exists approved boolean not null default true;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, role, approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'coach'),
    not coalesce((new.raw_user_meta_data ->> 'self_signup')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
