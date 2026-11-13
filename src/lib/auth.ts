import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  coachId: string | null; // set when role === 'coach'
  isSuperAdmin: boolean;
  canVerifyPayments: boolean; // granted by the super admin, independent of role
  canManageOrders: boolean; // granted by the super admin — supply team access
}

// Call at the top of any Server Component/page that needs to know who's
// logged in. Middleware already redirects unauthenticated requests to
// /login, so by the time this runs a session should exist — but we still
// guard defensively in case it's called from somewhere middleware misses.
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role, is_super_admin, can_verify_payments, can_manage_orders, coaches(id)')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/login');
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    coachId: Array.isArray(profile.coaches) ? profile.coaches[0]?.id ?? null : null,
    isSuperAdmin: profile.is_super_admin ?? false,
    canVerifyPayments: (profile.is_super_admin || profile.can_verify_payments) ?? false,
    canManageOrders: (profile.is_super_admin || profile.can_manage_orders) ?? false,
  };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user.role !== 'admin') {
    redirect('/overview');
  }
  return user;
}

// Control Centre — only the one protected super admin account may reach
// user-removal. Any other admin lands back on Settings.
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireAdmin();
  if (!user.isSuperAdmin) {
    redirect('/settings');
  }
  return user;
}

// Orders — admins and anyone the super admin has granted Order Access to
// (the "supply team" permission) can reach /orders.
export async function requireOrderAccess(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user.role !== 'admin' && !user.canManageOrders) {
    redirect('/overview');
  }
  return user;
}
