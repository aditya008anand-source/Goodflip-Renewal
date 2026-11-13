import { NextResponse } from 'next/server';
import { createServiceRoleSupabase } from '@/lib/supabase/server';

// A trivial, cheap database read whose only job is to count as "activity"
// so a free-tier Supabase project doesn't pause itself after 7 days of no
// use. Wire a Vercel Cron entry to hit this every 2-3 days (see README) —
// running `npm run dev`/visiting the app yourself also counts, so this is
// just a safety net for quiet weekends/holidays. No secret header required:
// it does nothing but read one row, so there's nothing to protect.
export async function GET() {
  const supabase = createServiceRoleSupabase();
  const { error } = await supabase.from('sync_logs').select('id').limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pinged_at: new Date().toISOString() });
}
