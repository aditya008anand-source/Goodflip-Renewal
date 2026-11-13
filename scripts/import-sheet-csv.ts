// One-off / repeatable import for the renewal sheet.
//
// Each row's month cohort is now taken from ITS OWN Plan Expiry Date, so you
// can keep adding new months' rows to the same sheet/tab over time and this
// script (or the Settings page "Sync now" button, once deployed) will sort
// each one into the right monthly tab automatically.
//
// Usage:
//   npm run import:november -- --url="https://docs.google.com/.../pub?output=csv"
// or, to import from a local file instead of fetching the published link:
//   npm run import:november -- --file=./november.csv
// --month=YYYY-MM is now OPTIONAL — it's only used as a fallback for the
// rare row whose Plan Expiry Date can't be parsed at all, and to resolve
// dates in the sheet with no year of their own (e.g. "19-Oct").
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
// Safe to re-run: rows are matched by source_row_key + month, so re-running
// only updates master fields on existing leads — it will NOT duplicate
// leads or re-insert attempt/payment history that migrated in last time.
import { config } from 'dotenv'; config({ path: '.env.local' });
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseSheetRows } from '../src/lib/sheetImport';
import { syncParsedLeadsToDatabase } from '../src/lib/sheetSync';

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? true];
    })
  );

  const now = new Date();
  const defaultCohort = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fallbackCohort = String(args.month ?? defaultCohort);
  const fallbackYear = Number(fallbackCohort.split('-')[0]);

  let csvText: string;
  if (args.file) {
    csvText = readFileSync(String(args.file), 'utf-8');
  } else if (args.url || process.env.GOOGLE_SHEET_CSV_URL) {
    const url = String(args.url ?? process.env.GOOGLE_SHEET_CSV_URL);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet CSV: ${res.status}`);
    csvText = await res.text();
  } else {
    throw new Error('Provide --file=<path> or --url=<csv link>, or set GOOGLE_SHEET_CSV_URL.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Parsing sheet (fallback cohort for undated rows: ${fallbackCohort})…`);
  const leads = parseSheetRows(csvText, fallbackYear, fallbackCohort);
  const cohorts = Array.from(new Set(leads.map((l) => l.monthCohort))).sort();
  console.log(
    `Parsed ${leads.length} rows across cohorts [${cohorts.join(', ')}]. ${leads.filter((l) => l.needsReview).length} flagged for review.`
  );

  const result = await syncParsedLeadsToDatabase(supabase, leads);

  await supabase.from('sync_logs').insert({
    source: 'csv_upload',
    status: result.errors.length === 0 ? 'success' : 'partial',
    rows_seen: result.rowsSeen,
    rows_added: result.rowsAdded,
    rows_updated: result.rowsUpdated,
    rows_flagged: result.rowsFlagged,
    error_message: result.errors.length ? result.errors.slice(0, 50).join('\n') : null,
  });

  console.log('Done:', result);
  if (result.errors.length) {
    console.log('\nErrors / rows that need a second look:');
    result.errors.forEach((e) => console.log(' -', e));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
