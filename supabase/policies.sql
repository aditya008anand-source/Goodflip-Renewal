-- Row Level Security policies for the MySaathi Renewal Management Portal.
-- Run AFTER schema.sql. This is the real access control layer — the
-- Next.js app's role checks are only there for UX (hiding nav links,
-- redirecting), never the thing that actually keeps a coach off another
-- coach's data.

alter table public.users enable row level security;
alter table public.coaches enable row level security;
alter table public.leads enable row level security;
alter table public.interactions enable row level security;
alter table public.payments enable row level security;
alter table public.incentive_settings enable row level security;
alter table public.sync_logs enable row level security;

-- Helper: is the current auth user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: coach row id for the current auth user, or null if they're an admin/not a coach.
create or replace function public.current_coach_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.coaches where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- users: everyone can read their own row (needed for role lookups in the
-- app); only admins can read/update everyone.
-- ---------------------------------------------------------------------------
drop policy if exists users_select_self_or_admin on public.users;
create policy users_select_self_or_admin on public.users
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists users_update_admin_only on public.users;
create policy users_update_admin_only on public.users
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- coaches: a coach can see their own profile; admins see/manage all.
-- ---------------------------------------------------------------------------
drop policy if exists coaches_select on public.coaches;
create policy coaches_select on public.coaches
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists coaches_insert_admin on public.coaches;
create policy coaches_insert_admin on public.coaches
  for insert with check (public.is_admin());

drop policy if exists coaches_update_admin on public.coaches;
create policy coaches_update_admin on public.coaches
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- leads: a coach sees only leads assigned to them; admin sees all.
-- Unassigned leads (coach_id is null) are admin-only until assigned.
-- ---------------------------------------------------------------------------
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select using (
    public.is_admin()
    or coach_id = public.current_coach_id()
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert with check (public.is_admin());

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update using (
    public.is_admin()
    or coach_id = public.current_coach_id()
  );
-- Coaches can update leads assigned to them (status, priority, follow-up
-- date) but reassignment (changing coach_id) is restricted to admins at the
-- application layer — see src/app/(dashboard)/leads/[id]/actions.ts.

-- ---------------------------------------------------------------------------
-- interactions: visible/insertable if you can see the parent lead.
-- Never updatable/deletable by anyone through the API — append-only history.
-- ---------------------------------------------------------------------------
drop policy if exists interactions_select on public.interactions;
create policy interactions_select on public.interactions
  for select using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (public.is_admin() or l.coach_id = public.current_coach_id())
    )
  );

drop policy if exists interactions_insert on public.interactions;
create policy interactions_insert on public.interactions
  for insert with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (public.is_admin() or l.coach_id = public.current_coach_id())
    )
  );
-- No update/delete policy exists for interactions, which with RLS enabled
-- means those operations are denied outright for every role, including admin,
-- through the normal API. (A superuser/service-role connection can still
-- correct a genuine data-entry mistake directly in the SQL editor if ever needed.)

-- ---------------------------------------------------------------------------
-- payments: same visibility rule as interactions; append-only.
-- ---------------------------------------------------------------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (public.is_admin() or l.coach_id = public.current_coach_id())
    )
  );

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (public.is_admin() or l.coach_id = public.current_coach_id())
    )
  );

-- ---------------------------------------------------------------------------
-- incentive_settings / sync_logs: admin-only, end to end.
-- ---------------------------------------------------------------------------
drop policy if exists incentive_admin_only on public.incentive_settings;
create policy incentive_admin_only on public.incentive_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sync_logs_admin_only on public.sync_logs;
create policy sync_logs_admin_only on public.sync_logs
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: payment screenshots. Path convention enforced by the app is
-- `{lead_id}/{filename}`; policy checks the uploader can see that lead.
-- ---------------------------------------------------------------------------
drop policy if exists payment_screenshots_select on storage.objects;
create policy payment_screenshots_select on storage.objects
  for select using (
    bucket_id = 'payment-screenshots'
    and exists (
      select 1 from public.leads l
      where l.id::text = (storage.foldername(name))[1]
        and (public.is_admin() or l.coach_id = public.current_coach_id())
    )
  );

drop policy if exists payment_screenshots_insert on storage.objects;
create policy payment_screenshots_insert on storage.objects
  for insert with check (
    bucket_id = 'payment-screenshots'
    and exists (
      select 1 from public.leads l
      where l.id::text = (storage.foldername(name))[1]
        and (public.is_admin() or l.coach_id = public.current_coach_id())
    )
  );
