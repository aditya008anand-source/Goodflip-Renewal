-- Goodflip — Migration 8
-- Run this in the Supabase SQL editor AFTER migration-7.sql has already
-- been run. Safe to re-run.
--
-- Adds:
--   1. leads.active — soft-delete flag. When a lead disappears from the
--      Google Sheet on a later sync, the sync job now sets this to false
--      instead of deleting the row. Every page (Leads/Overview/Revenue)
--      filters on active = true, so the lead stops showing up anywhere in
--      the CRM — but its call history and payment/revenue records are
--      NEVER deleted (interactions/payments cascade-delete on a real leads
--      row delete, which would otherwise permanently wipe verified revenue
--      the moment a row briefly dropped out of the sheet by mistake). If a
--      lead reappears in a later sheet pull, the sync job flips it back to
--      active = true automatically.
--   2. sync_logs.rows_deactivated — count of leads turned inactive on a
--      given sync run, so Settings can show it alongside rows_added etc.
--   3. lead_overview.latest_verification_status — the most recent
--      payment's verification_status (pending/verified/rejected), exposed
--      alongside the existing latest_payment_status so the Leads page can
--      filter on "Paid but pending verification" vs "Paid and verified".

alter table public.leads add column if not exists active boolean not null default true;

alter table public.sync_logs add column if not exists rows_deactivated int not null default 0;

-- CREATE OR REPLACE VIEW can't be used here: adding leads.active above
-- means l.* now has one more column than before, which would shift every
-- column that comes after it (coach_name, days_to_expiry, ...) by one
-- position — Postgres refuses that as a column rename. Drop + recreate
-- instead; nothing else in the database references this view by name in
-- a way that would break (no FKs, no other views/policies depend on it).
drop view if exists public.lead_overview;

create view public.lead_overview
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
  coalesce(p.latest_payment_status, l.payment_status) as latest_payment_status,
  p.latest_verification_status
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
  select status as latest_payment_status, verification_status as latest_verification_status
  from public.payments
  where lead_id = l.id
  order by created_at desc
  limit 1
) p on true;
