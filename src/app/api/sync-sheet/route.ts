import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleSupabase } from '@/lib/supabase/server';
import { parseSheetRows } from '@/lib/sheetImport';
import { syncParsedLeadsToDatabase } from '@/lib/sheetSync';
import { currentMonthCohort } from '@/lib/months';

// Triggered by the Settings page "Sync now" button, or on a schedule via
// Vercel Cron (see README — add a cron entry hitting this route with the
// same secret header). Uses the service-role key because it must write
// leads/interactions/payments for ALL coaches, not just one signed-in user.
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret');
  if (!process.env.SYNC_API_SECRET || secret !== process.env.SYNC_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (!sheetUrl) {
    return NextResponse.json({ error: 'GOOGLE_SHEET_CSV_URL is not configured' }, { status: 500 });
  }

  const supabase = createServiceRoleSupabase();
  // Only used as a fallback for a row with no parseable Plan Expiry Date —
  // every normal row now gets its own month cohort from its own expiry date,
  // so old and new months can sit in the same sheet/tab.
  const fallbackCohort = currentMonthCohort();

  try {
    const csvResponse = await fetch(sheetUrl, { cache: 'no-store' });
    if (!csvResponse.ok) throw new Error(`Failed to fetch sheet: ${csvResponse.status}`);
    const csvText = await csvResponse.text();

    const fallbackYear = new Date().getFullYear();
    const leads = parseSheetRows(csvText, fallbackYear, fallbackCohort);
    const result = await syncParsedLeadsToDatabase(supabase, leads);

    await supabase.from('sync_logs').insert({
      source: 'google_sheet',
      status: result.errors.length === 0 ? 'success' : 'partial',
      rows_seen: result.rowsSeen,
      rows_added: result.rowsAdded,
      rows_updated: result.rowsUpdated,
      rows_flagged: result.rowsFlagged,
      error_message: result.errors.length ? result.errors.slice(0, 20).join('\n') : null,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    await supabase.from('sync_logs').insert({
      source: 'google_sheet',
      status: 'failed',
      error_message: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
