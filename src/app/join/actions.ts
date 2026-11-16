'use server';

import { createServiceRoleSupabase } from '@/lib/supabase/server';

// Deliberately public — no requireAdmin() here. Anyone with the /join link
// can call this, so the @tatvacare.in email check below is the only gate on
// who can create a login at all; the real access control is that the
// account stays unapproved (see migration-7.sql) until an admin flips it on
// from Settings.
export async function requestAccess(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!name || !email || !password) throw new Error('All fields are required.');
  if (!email.endsWith('@tatvacare.in')) {
    throw new Error('Please use your @tatvacare.in email address.');
  }
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  if (password !== confirmPassword) throw new Error('Passwords do not match.');

  const admin = createServiceRoleSupabase();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // they just set this password themselves — no separate email verification needed
    user_metadata: { name, role: 'coach', self_signup: true },
  });
  if (error) throw new Error(error.message);

  // public.users row (with approved = false) is created by the
  // on_auth_user_created trigger. Give them a coaches row too, same as the
  // admin-invite path — without it the rest of the app has nowhere to hang
  // their leads/payments once approved.
  const { error: coachError } = await admin.from('coaches').insert({
    user_id: data.user.id,
    display_name: name,
  });
  if (coachError) throw new Error(coachError.message);
}
