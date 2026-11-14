'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireSuperAdmin } from '@/lib/auth';
import { createServerSupabase, createServiceRoleSupabase } from '@/lib/supabase/server';

export async function inviteCoach(formData: FormData): Promise<string> {
  await requireAdmin();

  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? 'coach') === 'admin' ? 'admin' : 'coach';
  if (!email || !name) throw new Error('Name and email are required.');

  // Requires the service-role key — this is the one place the app
  // deliberately bypasses RLS, to create the auth user.
  const admin = createServiceRoleSupabase();

  // generateLink creates the user + a one-time invite link WITHOUT sending
  // any email itself (Supabase's default mailer and the custom SMTP options
  // we tried were both unreliable). The admin copies the returned link and
  // sends it manually (WhatsApp, email, etc.) instead.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { name, role },
    },
  });
  if (error) throw new Error(error.message);

  // public.users row is created by the on_auth_user_created trigger with the
  // role above. Only a coach also gets a coaches row — admins don't have one.
  if (role === 'coach') {
    const { error: coachError } = await admin.from('coaches').insert({
      user_id: data.user.id,
      display_name: name,
    });
    if (coachError) throw new Error(coachError.message);
  }

  revalidatePath('/settings');
  return data.properties.action_link;
}

// "Later" path for item 2 — turn an existing coach into an admin, or an
// existing admin back into a coach, without anyone touching SQL.
export async function promoteToAdmin(userId: string) {
  await requireAdmin();
  const admin = createServiceRoleSupabase();
  const { error } = await admin.from('users').update({ role: 'admin' }).eq('id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

export async function demoteToCoach(userId: string, displayName: string) {
  await requireAdmin();
  const admin = createServiceRoleSupabase();

  const { error } = await admin.from('users').update({ role: 'coach' }).eq('id', userId);
  if (error) throw new Error(error.message);

  // Give them back a coaches row if they don't already have one (e.g. they
  // were invited straight to admin and never had one).
  const { data: existing } = await admin.from('coaches').select('id').eq('user_id', userId).maybeSingle();
  if (!existing) {
    const { error: coachError } = await admin
      .from('coaches')
      .insert({ user_id: userId, display_name: displayName });
    if (coachError) throw new Error(coachError.message);
  }

  revalidatePath('/settings');
}

// Only the super admin decides who can verify payments — granting this is
// NOT the same as being an admin, by design (so not every admin can approve
// a payment).
export async function setVerifyAccess(userId: string, allowed: boolean) {
  await requireSuperAdmin();
  const admin = createServiceRoleSupabase();
  const { error } = await admin.from('users').update({ can_verify_payments: allowed }).eq('id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

// Same idea as Verify Access — only the super admin decides who's on the
// "supply team" that can fill in Order ID/tracking/Plan Assigned.
export async function setOrderAccess(userId: string, allowed: boolean) {
  await requireSuperAdmin();
  const admin = createServiceRoleSupabase();
  const { error } = await admin.from('users').update({ can_manage_orders: allowed }).eq('id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

// Control Centre — super admin only (also enforced by a DB trigger that
// refuses to delete a super-admin row, and by requireSuperAdmin() here).
export async function removeUser(userId: string) {
  const me = await requireSuperAdmin();
  if (userId === me.id) throw new Error('You cannot remove your own account.');

  const admin = createServiceRoleSupabase();
  const { data: target } = await admin.from('users').select('is_super_admin').eq('id', userId).single();
  if (target?.is_super_admin) throw new Error('The super admin account cannot be removed.');

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  revalidatePath('/settings');
}

export async function addPaymentCategory(formData: FormData) {
  await requireAdmin();
  const supabase = createServerSupabase();

  const name = String(formData.get('name') ?? '').trim();
  const kind = String(formData.get('kind') ?? 'product') === 'service' ? 'service' : 'product';
  const teamSubcategory = String(formData.get('team_subcategory') ?? '').trim() || null;
  if (!name) throw new Error('Category name is required.');

  const { error } = await supabase.from('payment_categories').insert({
    name,
    kind,
    team_subcategory: teamSubcategory,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/settings');
  revalidatePath('/leads');
}

export async function setCategoryActive(categoryId: string, active: boolean) {
  await requireAdmin();
  const supabase = createServerSupabase();
  const { error } = await supabase.from('payment_categories').update({ active }).eq('id', categoryId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

// Switches a category between the existing simple %/fixed rule
// (incentive_settings) and the new target-tiered ladder
// (incentive_target_tiers) — e.g. "Careplan" goes target_tiered, everything
// else stays simple_percentage.
export async function setCategoryIncentiveMode(categoryId: string, mode: 'simple_percentage' | 'target_tiered') {
  await requireAdmin();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('payment_categories')
    .update({ incentive_mode: mode })
    .eq('id', categoryId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
  revalidatePath('/revenue');
}

export async function addIncentiveTargetTier(formData: FormData) {
  await requireAdmin();
  const supabase = createServerSupabase();

  const categoryId = String(formData.get('category_id') ?? '').trim();
  const monthCohort = String(formData.get('month_cohort') ?? '').trim() || null;
  const targetType = String(formData.get('target_type') ?? 'percentage') === 'count' ? 'count' : 'percentage';
  const minValue = Number(formData.get('min_value') ?? NaN);
  const incentivePercent = Number(formData.get('incentive_percent') ?? NaN);
  const effectiveFrom = String(formData.get('effective_from') ?? '') || new Date().toISOString().slice(0, 10);

  if (!categoryId) throw new Error('Category is required.');
  if (Number.isNaN(minValue) || minValue < 0) throw new Error('Minimum target must be 0 or more.');
  if (Number.isNaN(incentivePercent) || incentivePercent < 0) throw new Error('Incentive % must be 0 or more.');

  const { error } = await supabase.from('incentive_target_tiers').insert({
    category_id: categoryId,
    month_cohort: monthCohort,
    target_type: targetType,
    min_value: minValue,
    incentive_percent: incentivePercent,
    effective_from: effectiveFrom,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/settings');
  revalidatePath('/revenue');
}

export async function setCoachActive(coachId: string, active: boolean) {
  await requireAdmin();
  const supabase = createServerSupabase();
  const { error } = await supabase.from('coaches').update({ active }).eq('id', coachId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

export async function addIncentiveRule(formData: FormData) {
  await requireAdmin();
  const supabase = createServerSupabase();

  const categoryId = String(formData.get('category_id') ?? '').trim() || null;
  const monthCohort = String(formData.get('month_cohort') ?? '').trim() || null;
  const type = String(formData.get('type') ?? 'percentage');
  const value = Number(formData.get('value') ?? 0);
  const effectiveFrom = String(formData.get('effective_from') ?? '') || new Date().toISOString().slice(0, 10);

  if (!value || value <= 0) throw new Error('Incentive value must be greater than zero.');

  const { error } = await supabase.from('incentive_settings').insert({
    category_id: categoryId,
    month_cohort: monthCohort,
    type,
    value,
    effective_from: effectiveFrom,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/settings');
  revalidatePath('/revenue');
}

export async function triggerSheetSync() {
  await requireAdmin();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/api/sync-sheet`,
    {
      method: 'POST',
      headers: { 'x-sync-secret': process.env.SYNC_API_SECRET ?? '' },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sync failed: ${body}`);
  }

  revalidatePath('/settings');
  revalidatePath('/leads');
  revalidatePath('/overview');
}
