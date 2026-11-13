// Shared parsing logic for the November source sheet, used by both the
// one-off import script (scripts/import-sheet-csv.ts) and the recurring
// /api/sync-sheet route. Kept framework/Supabase-free so it's easy to unit
// test against the real CSV on its own.
import { parse } from 'csv-parse/sync';
import { mapFinalStatusToLeadStatus } from './statusMapping';

// Column positions in the source sheet, by index (not by header name — the
// sheet repeats the header "Comments" three times, which would otherwise
// collide). Re-check these indexes if the sheet's column order ever changes.
const COL = {
  patientName: 0,
  phone: 1,
  planName: 2,
  condition: 3,
  team: 4,
  renewalCoach: 5,
  coaches: 6, // clinical discipline
  planExpiry: 7,
  leadMasterStatus: 8, // "Active" / "Inactive" / "Nutra Order" — distinct from the portal's own workflow status
  refundStatus: 9,
  paymentAmount: 15,
  renewedPlan: 16,
  attempt1Date: 20,
  attempt1Comment: 21,
  attempt2Date: 22,
  attempt2Comment: 23,
  attempt3Date: 24,
  attempt3Comment: 25,
  finalStatus: 26,
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Parses the sheet's inconsistent date formats: "1-Nov-26", "19-Oct" (no
// year), "23rd Oct 26" (ordinal, space-separated). Falls back to
// `fallbackYear` when the sheet gives no year of its own.
export function parseSheetDate(raw: string | undefined, fallbackYear: number): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  if (!cleaned || /^na$/i.test(cleaned)) return null;

  // Numeric day-month(-year) formats: "28.10.2026", "22/10/2026", "9/4".
  const numeric = cleaned.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (numeric) {
    const [, dayStr, monthStr, yearStr] = numeric;
    const month = Number(monthStr);
    if (month < 1 || month > 12) return null;
    let year = fallbackYear;
    if (yearStr) year = yearStr.length === 2 ? 2000 + Number(yearStr) : Number(yearStr);
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(dayStr)).padStart(2, '0')}`;
  }

  // "1-Nov-26" / "19-Oct" / "23 Oct 26" style (month name, hyphen or space separated).
  const named = cleaned.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]*(\d{2,4})?$/);
  if (named) {
    const [, dayStr, monthStr, yearStr] = named;
    const month = MONTHS[monthStr.slice(0, 3).toLowerCase()];
    if (!month) return null;
    let year = fallbackYear;
    if (yearStr) year = yearStr.length === 2 ? 2000 + Number(yearStr) : Number(yearStr);
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(dayStr)).padStart(2, '0')}`;
  }

  return null;
}

export function normalizeMobile(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10);
}

export interface ParsedAttempt {
  callDate: string; // ISO date
  outcome: string;
}

export interface ParsedLead {
  patientName: string;
  mobileNumber: string;
  programme: string | null;
  condition: string | null;
  team: string | null;
  sourceCoachName: string | null;
  clinicalDiscipline: string | null;
  planExpiryDate: string | null;
  status: string;
  leadMasterStatus: string | null; // sheet Column I: "Active" / "Inactive" / "Nutra Order"
  needsReview: boolean;
  reviewNote: string | null;
  attempts: ParsedAttempt[];
  payment: { amount: number; note: string | null } | null;
  rowKey: string; // dedup key for this row
  monthCohort: string; // 'YYYY-MM' — derived per-row from Plan Expiry Date, not passed in globally
}

// `fallbackYear` resolves ambiguous dates with no year of their own (e.g. "19-Oct").
// `fallbackCohort` ('YYYY-MM') is used only for the rare row with no parseable
// Plan Expiry Date at all, so every row still lands somewhere sensible.
export function parseSheetRows(
  csvText: string,
  fallbackYear: number,
  fallbackCohort: string = `${fallbackYear}-01`
): ParsedLead[] {
  const rows: string[][] = parse(csvText, { skip_empty_lines: true });
  const dataRows = rows.slice(1); // drop header row

  const seenMobiles = new Map<string, string>(); // mobile -> patient name (as first seen), to detect true collisions

  return dataRows
    .filter((r) => r[COL.patientName]?.trim())
    .map((row): ParsedLead => {
      const patientName = row[COL.patientName].trim();
      const mobileNumber = normalizeMobile(row[COL.phone] ?? '');

      const reviewNotes: string[] = [];

      // Phone-collision handling. Two rows sharing a phone with the SAME
      // name (just different casing, e.g. "Mayuri..." vs "MAYURI...") are
      // the same patient with a second row (typically a Nutra/product
      // add-on order) — these intentionally share one lead via the plain
      // mobile-number row key, per the agreed mobile-number-alone identity
      // rule. Only a genuinely DIFFERENT name on the same number is kept as
      // a separate lead (row key becomes mobile+name) and flagged for
      // manual review, per "keep both, don't remove anything" decision.
      let rowKey = mobileNumber;
      const normalizedName = patientName.trim().toLowerCase();
      const priorName = seenMobiles.get(mobileNumber);
      if (priorName && priorName !== normalizedName) {
        rowKey = `${mobileNumber}:${patientName}`;
        reviewNotes.push(
          `Mobile number ${mobileNumber} is also used by a differently-named patient in this sheet — kept as a separate lead, please verify.`
        );
      }
      seenMobiles.set(mobileNumber, normalizedName);

      const finalStatusRaw = row[COL.finalStatus]?.trim() ?? '';
      const { status, matched } = mapFinalStatusToLeadStatus(finalStatusRaw);
      if (finalStatusRaw && !matched) {
        reviewNotes.push(`Unmapped "Final Status" value from sheet: "${finalStatusRaw}" — defaulted to New.`);
      }

      if (row[COL.refundStatus]?.trim()) {
        reviewNotes.push(`Source sheet marks this as: ${row[COL.refundStatus].trim()}.`);
      }

      const attempts: ParsedAttempt[] = [];
      const attemptPairs: [number, number][] = [
        [COL.attempt1Date, COL.attempt1Comment],
        [COL.attempt2Date, COL.attempt2Comment],
        [COL.attempt3Date, COL.attempt3Comment],
      ];
      for (const [dateCol, commentCol] of attemptPairs) {
        const dateRaw = row[dateCol]?.trim();
        const outcome = row[commentCol]?.trim();
        if (!dateRaw || /^na$/i.test(dateRaw)) continue; // "NA" = attempt not applicable, skip
        const callDate = parseSheetDate(dateRaw, fallbackYear);
        if (!callDate) {
          reviewNotes.push(`Could not parse attempt date "${dateRaw}" — this attempt was skipped.`);
          continue;
        }
        attempts.push({ callDate, outcome: outcome || '(no outcome recorded in sheet)' });
      }

      const paymentAmountRaw = row[COL.paymentAmount]?.trim().replace(/,/g, '');
      const payment =
        paymentAmountRaw && !Number.isNaN(Number(paymentAmountRaw)) && Number(paymentAmountRaw) > 0
          ? {
              amount: Number(paymentAmountRaw),
              note: row[COL.renewedPlan]?.trim() || null,
            }
          : null;

      const sourceCoachName = row[COL.renewalCoach]?.trim() || null;

      const planExpiryDate = parseSheetDate(row[COL.planExpiry], fallbackYear);
      // Month cohort now comes from each row's own expiry date, so rows for
      // different months can live in the same sheet/tab and each lands in
      // its correct monthly tab automatically — no manual --month needed.
      let monthCohort = fallbackCohort;
      if (planExpiryDate) {
        monthCohort = planExpiryDate.slice(0, 7);
      } else {
        reviewNotes.push(
          `No parseable Plan Expiry Date — defaulted to ${fallbackCohort} cohort, please verify.`
        );
      }

      return {
        patientName,
        mobileNumber,
        programme: row[COL.planName]?.trim() || null,
        condition: row[COL.condition]?.trim() || null,
        team: row[COL.team]?.trim() || null,
        sourceCoachName,
        clinicalDiscipline: row[COL.coaches]?.trim() || null,
        planExpiryDate,
        status,
        leadMasterStatus: row[COL.leadMasterStatus]?.trim() || null,
        needsReview: reviewNotes.length > 0,
        reviewNote: reviewNotes.length ? reviewNotes.join(' ') : null,
        attempts,
        payment,
        rowKey,
        monthCohort,
      };
    });
}
