-- MySaathi Renewal Management Portal — core schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) BEFORE policies.sql.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / DROP ... IF EXISTS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. users — mirrors auth.users with the app-level role. A row here is
--    created automatically by the trigger below whenever someone signs up
--    or accepts an invite, so Admin never inserts into this table by hand.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'coach' check (role in ('admin', 'coach')),
  created_at timestamptz not null default now()
);

-- Keep public.users in sync with auth.users on signup/invite-accept.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'coach')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 2. coaches — one row per coach account, linked 1:1 to a users row.
--    Admins have no coaches row.
-- ---------------------------------------------------------------------------
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. leads — patient master + renewal record. One row per renewal cycle per
--    month_cohort, so the same patient can recur across months without
--    losing history (section 11 of the spec).
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  mobile_number text not null,
  coach_id uuid references public.coaches (id) on delete set null,
  programme text,
  condition text,
  clinical_discipline text, -- "Coaches" column in source sheet (Nutritionist/Psychologist/Physiotherapist)
  team text,                -- "Team" column in source sheet (Inside Sales/Field/Renewal)
  source_coach_name text,   -- "Renewal Coach" name as typed in the sheet, kept even when
                             -- coach_id can't be resolved yet (no matching coach account
                             -- invited so far); sync self-heals this once that coach exists.
  month_cohort text not null, -- '2026-11' etc — drives the monthly tabs
  plan_start_date date,
  plan_expiry_date date,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  status text not null default 'New' check (status in (
    'New', 'Not Contacted', 'Connected', 'Interested', 'Follow-up Required',
    'Payment Pending', 'Renewed', 'Not Interested', 'Not Reachable', 'Lost'
  )),
  payment_status text not null default 'Pending' check (payment_status in ('Pending', 'Paid')),
  source_row_key text, -- sync/dedup key, normally the mobile number
  needs_review boolean not null default false,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_coach on public.leads (coach_id);
create index if not exists idx_leads_month on public.leads (month_cohort);
create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_leads_priority on public.leads (priority);
create index if not exists idx_leads_expiry on public.leads (plan_expiry_date);
create index if not exists idx_leads_mobile on public.leads (mobile_number);
-- NOTE: deliberately NOT a unique index on mobile_number. Two source rows
-- were found sharing a phone number with different patient names; per
-- decision these import as separate lead rows rather than merging or being
-- dropped. source_row_key carries the dedup key used by the sync job
-- (mobile number normally; mobile+name when a collision like that occurs).

drop trigger if exists set_updated_at on public.leads;
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger set_updated_at before update on public.leads
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. interactions — append-only call/attempt history. Never updated or
--    deleted by the app; attempt_number is assigned server-side by trigger
--    so coaches never type it in.
-- ---------------------------------------------------------------------------
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  attempt_number int not null,
  call_datetime timestamptz not null default now(),
  outcome text not null,
  comment text,
  next_followup_date date,
  updated_by uuid references public.users (id),
  updated_by_name text, -- denormalised label for rows migrated from the source sheet (no portal login)
  created_at timestamptz not null default now()
);

create index if not exists idx_interactions_lead on public.interactions (lead_id, attempt_number);

create or replace function public.set_attempt_number()
returns trigger language plpgsql as $$
begin
  select coalesce(max(attempt_number), 0) + 1 into new.attempt_number
  from public.interactions where lead_id = new.lead_id;
  return new;
end;
$$;

drop trigger if exists before_interaction_insert on public.interactions;
create trigger before_interaction_insert
  before insert on public.interactions
  for each row execute procedure public.set_attempt_number();

-- Keep the parent lead's status/last-attempt in sync whenever a new
-- interaction is logged, without the app having to do two writes.
create or replace function public.touch_lead_on_interaction()
returns trigger language plpgsql as $$
begin
  update public.leads set updated_at = now() where id = new.lead_id;
  return new;
end;
$$;

drop trigger if exists after_interaction_insert on public.interactions;
create trigger after_interaction_insert
  after insert on public.interactions
  for each row execute procedure public.touch_lead_on_interaction();

-- ---------------------------------------------------------------------------
-- 5. payments — append-only payment history (a lead can have more than one
--    row if a payment attempt failed/was refunded and retried).
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  status text not null default 'Pending' check (status in ('Pending', 'Paid')),
  amount numeric(12, 2),
  payment_date date,
  payment_ref text,
  screenshot_path text, -- storage object path in the 'payment-screenshots' bucket
  remarks text,
  recorded_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_lead on public.payments (lead_id);

-- ---------------------------------------------------------------------------
-- 6. incentive_settings — admin-configurable, versioned by effective_from so
--    changing a rule never rewrites history for already-closed months.
-- ---------------------------------------------------------------------------
create table if not exists public.incentive_settings (
  id uuid primary key default gen_random_uuid(),
  programme text, -- null = default rule applied when no programme-specific rule matches
  type text not null check (type in ('fixed', 'percentage')),
  value numeric(12, 2) not null,
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. sync_logs — one row per Google Sheets sync / CSV import run.
-- ---------------------------------------------------------------------------
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('google_sheet', 'csv_upload')),
  status text not null check (status in ('success', 'partial', 'failed')),
  rows_seen int not null default 0,
  rows_added int not null default 0,
  rows_updated int not null default 0,
  rows_flagged int not null default 0,
  error_message text,
  run_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- lead_overview — read-only view used by the Overview and Renewal Leads
-- pages so they don't each have to recompute attempt counts / last payment
-- status by hand. security_invoker=true means it still runs under the
-- querying user's own RLS (a coach only ever sees their own leads here too).
-- ---------------------------------------------------------------------------
create or replace view public.lead_overview
with (security_invoker = true) as
select
  l.*,
  c.display_name as coach_name,
  (l.plan_expiry_date - current_date) as days_to_expiry,
  coalesce(i.total_attempts, 0) as total_attempts,
  i.first_attempt_date,
  i.last_attempt_date,
  i.last_comment,
  i.last_outcome,
  i.next_followup_date,
  coalesce(p.latest_payment_status, l.payment_status) as latest_payment_status
from public.leads l
left join public.coaches c on c.id = l.coach_id
left join lateral (
  select
    count(*) as total_attempts,
    min(call_datetime) as first_attempt_date,
    max(call_datetime) as last_attempt_date,
    (array_agg(comment order by call_datetime desc))[1] as last_comment,
    (array_agg(outcome order by call_datetime desc))[1] as last_outcome,
    max(next_followup_date) filter (where next_followup_date >= current_date) as next_followup_date
  from public.interactions
  where lead_id = l.id
) i on true
left join lateral (
  select status as latest_payment_status
  from public.payments
  where lead_id = l.id
  order by created_at desc
  limit 1
) p on true;

-- ---------------------------------------------------------------------------
-- Storage bucket for payment screenshots.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do nothing;
