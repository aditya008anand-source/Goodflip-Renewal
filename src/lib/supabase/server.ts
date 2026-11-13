import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types';

// Server Component / Route Handler Supabase client — reads the signed-in
// user's session from cookies, so every query still goes through RLS as
// that specific coach or admin. Never use the service-role key here.
export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't set cookies.
            // Safe to ignore — middleware.ts refreshes the session instead.
          }
        },
      },
    }
  );
}

// Admin-privileged client using the service-role key. ONLY ever used inside
// server-only code that must bypass RLS on purpose: the Google Sheets sync
// route and the one-off import script. Never import this from a Server
// Component, Client Component, or anything that runs per-request-user.
export function createServiceRoleSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
