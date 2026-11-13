'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types';

// Browser-side Supabase client. Uses the anon key; all access control
// is enforced by Postgres Row Level Security policies (see supabase/schema.sql
// and supabase/policies.sql), never by hiding UI.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
