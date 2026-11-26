import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedLead } from './sheetImport';

export interface SyncResult {
  rowsSeen: number;
  rowsAdded: number;
  rowsUpdated: number;
  rowsFlagged: number;
  rowsDeactivated: number;
  errors: string[];
}

// Upserts parsed sheet rows into the database WITHOUT ever overwriting
// interaction history or payment records that already exist for a lead —
// only "master" fields (name, programme, expiry date, etc.) get refreshed
// on an existing lead. New leads get their initial interactions/payment
// migrated in from the sheet's 1st/2nd/3rd attempt columns and Payment
// Amount column; that migration only happens once, on first import, driven
// by `rowKey` not existing yet.
export async function syncParsedLeadsToDatabase(
  supabase: SupabaseClient,
  leads: ParsedLead[]
): Promise<SyncResult> {
  const result: SyncResult = {
    rowsSeen: 0,
    rowsAdded: 0,
    rowsUpdated: 0,
    rowsFlagged: 0,
    rowsDeactivated: 0,
    errors: [],
  };

  // Resolve source_coach_name -> coach_id against coaches that already have
  // an invited account, matching case-insensitively on display_name.
  const { data: coaches } = await supabase.from('coaches').select('id, display_name');
  const coachByName = new Map(
    (coaches ?? []).map((c: any) => [c.display_name.trim().toLowerCase(), c.id])
  );

  // Resolve a migrated payment's category from sheet column Q (Renewed
  // Plan), matched case-insensitively against payment_categories.name. Only
  // an exact (trimmed, lowercased) match sets category_id — anything blank
  // or unrecognised is left uncategorised, exactly as before this change.
  const { data: categories } = await supabase.from('payment_categories').select('id, name');
  const categoryByName = new Map(
    (categories ?? []).map((c: any) => [c.name.trim().toLowerCase(), c.id])
  );

  // Every (rowKey, monthCohort) seen in THIS sheet pull — used after the
  // loop to find leads that used to exist for a month but have now
  // disappeared from the sheet, so they can be soft-deleted (never a hard
  // delete, which would cascade and wipe their call/payment history).
  const seenKeys = new Set<string>();
  const monthCohortsSeen = new Set<string>();

  for (const lead of leads) {
    result.rowsSeen += 1;
    seenKeys.add(`${lead.rowKey}::${lead.monthCohort}`);
    monthCohortsSeen.add(lead.monthCohort);
    try {
      const coachId = lead.sourceCoachName
        ? coachByName.get(lead.sourceCoachName.trim().toLowerCase()) ?? null
        : null;

      const { data: existing } = await supabase
        .from('leads')
        .select('*')
        .eq('source_row_key', lead.rowKey)
        .eq('month_cohort', lead.monthCohort)
        .maybeSingle();

      if (existing) {
        // Update master fields, but "first non-empty value wins": a second
        // sheet row for the same lead (e.g. a sparser Nutra/add-on order row
        // sharing the same phone number) must never blank out or replace
        // good data a richer earlier row already set. Only fields that are
        // currently empty on the existing lead get filled in from this row.
        const candidateFields: Record<string, unknown> = {
          patient_name: lead.patientName,
          programme: lead.programme,
          condition: lead.condition,
          team: lead.team,
          clinical_discipline: lead.clinicalDiscipline,
          plan_expiry_date: lead.planExpiryDate,
          old_plan_price: lead.oldPlanPrice,
        };
        const updatePayload: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(candidateFields)) {
          if (value != null && value !== '' && (existing as any)[field] == null) {
            updatePayload[field] = value;
          }
        }

        // source_coach_name (sheet's "Renewal Coach" column) is, like
        // lead_master_status below, a live value that can genuinely change
        // run to run (a coach reassignment) — it must always be refreshed
        // here, not just filled in once while empty, otherwise a
        // reassignment in the sheet would silently never reach the
        // dashboard. coach_id is re-derived alongside it every time the
        // name changes, not only the first time it's set.
        if (
          lead.sourceCoachName != null &&
          lead.sourceCoachName !== '' &&
          lead.sourceCoachName !== (existing as any).source_coach_name
        ) {
          updatePayload.source_coach_name = lead.sourceCoachName;
          updatePayload.coach_id = coachId ?? null;
        } else if (!existing.coach_id && coachId) {
          updatePayload.coach_id = coachId;
        }

        // Reappeared after being soft-deleted on an earlier sync (removed
        // from the sheet, then added back) — bring it back into every page.
        if ((existing as any).active === false) updatePayload.active = true;

        // lead_master_status (sheet Column I: Active/Inactive/Nutra Order) is
        // different from the fields above — it's a live sheet value that can
        // genuinely change run to run, so it's always refreshed here rather
        // than only filled in once while empty.
        if (lead.leadMasterStatus !== (existing as any).lead_master_status) {
          updatePayload.lead_master_status = lead.leadMasterStatus;
        }

        if (Object.keys(updatePayload).length > 0) {
          const { error } = await supabase.from('leads').update(updatePayload).eq('id', existing.id);
          if (error) throw error;
        }
        result.rowsUpdated += 1;
        if (lead.needsReview) result.rowsFlagged += 1;
        continue;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('leads')
        .insert({
          patient_name: lead.patientName,
          mobile_number: lead.mobileNumber,
          programme: lead.programme,
          condition: lead.condition,
          team: lead.team,
          clinical_discipline: lead.clinicalDiscipline,
          source_coach_name: lead.sourceCoachName,
          coach_id: coachId,
          month_cohort: lead.monthCohort,
          plan_expiry_date: lead.planExpiryDate,
          old_plan_price: lead.oldPlanPrice,
          status: lead.status,
          lead_master_status: lead.leadMasterStatus,
          needs_review: lead.needsReview,
          review_note: lead.reviewNote,
          source_row_key: lead.rowKey,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      result.rowsAdded += 1;
      if (lead.needsReview) result.rowsFlagged += 1;

      // Migrate attempt history (new lead only — never re-run against an
      // existing lead, which is why this sits inside the `!existing` branch).
      for (const attempt of lead.attempts) {
        const { error: interactionError } = await supabase.from('interactions').insert({
          lead_id: inserted.id,
          call_datetime: attempt.callDate,
          outcome: attempt.outcome,
          updated_by_name: lead.sourceCoachName ?? 'Migrated from source sheet',
        });
        if (interactionError) result.errors.push(interactionError.message);
      }

      if (lead.payment) {
        const categoryId = lead.payment.categoryName
          ? categoryByName.get(lead.payment.categoryName.trim().toLowerCase()) ?? null
          : null;
        const { error: paymentError } = await supabase.from('payments').insert({
          lead_id: inserted.id,
          status: 'Paid',
          amount: lead.payment.amount,
          category_id: categoryId,
          remarks: lead.payment.note
            ? `Migrated from source sheet. Renewed plan: ${lead.payment.note}`
            : 'Migrated from source sheet.',
        });
        if (paymentError) result.errors.push(paymentError.message);
        else {
          await supabase.from('leads').update({ payment_status: 'Paid' }).eq('id', inserted.id);
        }
      }
    } catch (err: any) {
      result.errors.push(`${lead.patientName} (${lead.mobileNumber}): ${err.message}`);
    }
  }

  // Soft-delete: for every month cohort this sheet pull touched, any
  // currently-active lead whose (rowKey, monthCohort) was NOT seen in this
  // pull has been removed from the sheet — deactivate it rather than
  // deleting the row, so its call history and payment/revenue records stay
  // intact for audit and nothing already-verified is lost.
  for (const monthCohort of monthCohortsSeen) {
    const { data: existingForMonth } = await supabase
      .from('leads')
      .select('id, source_row_key')
      .eq('month_cohort', monthCohort)
      .eq('active', true);

    const idsToDeactivate = (existingForMonth ?? [])
      .filter((l) => !seenKeys.has(`${l.source_row_key}::${monthCohort}`))
      .map((l) => l.id);

    if (idsToDeactivate.length > 0) {
      const { error: deactivateError } = await supabase
        .from('leads')
        .update({ active: false })
        .in('id', idsToDeactivate);
      if (deactivateError) result.errors.push(deactivateError.message);
      else result.rowsDeactivated += idsToDeactivate.length;
    }
  }

  return result;
}
