-- Goodflip — Migration 10
-- Run this in the Supabase SQL editor AFTER migration-9.sql has already
-- been run. Safe to re-run.
--
-- Adds:
--   1. payments.plan_details — JSONB, optional structured details captured
--      only when the selected category is in the Careplan target_group
--      (plan name, duration, diagnostics/consultation counts, coaches,
--      drug, BCA/CGM device info). Null for every other payment.
--   2. lead_overview.payment_summary — a one-line text summary of every
--      Paid payment recorded against that lead this run, grouped/summed
--      by category, e.g. "Careplan ₹6,000, Nutra ₹1,000" — computed here
--      in SQL (same lateral-join pattern the view already uses for
--      interactions/latest payment) so the Leads list page can show it
--      without any extra per-row query from the app.

alter table public.payments add column if not exists plan_details jsonb;

-- Purely additive (new column at the very end) — CREATE OR REPLACE VIEW is
-- fine here, unlike migration-8's drop+recreate which had to insert a
-- column in the middle of the list.
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
  coalesce(p.latest_payment_status, l.payment_status) as latest_payment_status,
  p.latest_verification_status,
  ps.payment_summary
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
) p on true
left join lateral (
  select string_agg(
    category_name || ' ₹' || to_char(category_total, 'FM999,999,990'),
    ', ' order by category_total desc
  ) as payment_summary
  from (
    select coalesce(pc.name, 'Uncategorised') as category_name, sum(p2.amount) as category_total
    from public.payments p2
    left join public.payment_categories pc on pc.id = p2.category_id
    where p2.lead_id = l.id and p2.status = 'Paid'
    group by coalesce(pc.name, 'Uncategorised')
  ) cat
) ps on true;
