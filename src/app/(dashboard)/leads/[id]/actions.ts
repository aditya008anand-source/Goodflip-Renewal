'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export async function addInteraction(leadId: string, formData: FormData) {
  const user = await getCurrentUser();
  const supabase = createServerSupabase();

  const comment = String(formData.get('comment') ?? '').trim();
  const nextFollowupDate = String(formData.get('next_followup_date') ?? '') || null;
  const callDatetime = String(formData.get('call_datetime') ?? '') || new Date().toISOString();
  const newStatus = String(formData.get('status') ?? '').trim();

  if (!newStatus) throw new Error('Status is required.');

  // There's no separate "Outcome" field any more — the chosen status IS the
  // outcome recorded for this attempt (interactions.outcome stays NOT NULL
  // in the DB, so every attempt still has a value here).
  // attempt_number is assigned server-side by a DB trigger — never trust a
  // client-supplied value, and this insert never overwrites a previous
  // attempt's row (the table is append-only; RLS has no update policy at all).
  const { error: interactionError } = await supabase.from('interactions').insert({
    lead_id: leadId,
    call_datetime: callDatetime,
    outcome: newStatus,
    comment: comment || null,
    next_followup_date: nextFollowupDate,
    updated_by: user.id,
  });
  if (interactionError) throw new Error(interactionError.message);

  const { error: statusError } = await supabase
    .from('leads')
    .update({ status: newStatus })
    .eq('id', leadId);
  if (statusError) throw new Error(statusError.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
}

export async function recordPayment(leadId: string, formData: FormData) {
  const user = await getCurrentUser();
  const supabase = createServerSupabase();

  // A payment is only ever logged once the money has actually come in, so
  // there's no "Pending" choice any more — every row recorded here is Paid.
  const amount = formData.get('amount') ? Number(formData.get('amount')) : null;
  const paymentDate = String(formData.get('payment_date') ?? '') || null;
  const paymentRef = String(formData.get('payment_ref') ?? '').trim() || null;
  const remarks = String(formData.get('remarks') ?? '').trim() || null;
  const categoryId = String(formData.get('category_id') ?? '').trim() || null;
  const screenshot = formData.get('screenshot') as File | null;
  const planDetailsRaw = String(formData.get('plan_details') ?? '').trim() || null;

  if (!categoryId) throw new Error('Product/Service is required.');
  if (!amount) throw new Error('Amount is required.');
  if (!paymentDate) throw new Error('Payment date is required.');
  if (!remarks) throw new Error('Remarks are required.');
  if (!screenshot || screenshot.size === 0) throw new Error('Payment screenshot is required.');

  // A Careplan-group category requires its plan-details form to have been
  // filled in — checked here too (not just in the client form) so this
  // can never be bypassed by calling the action directly. Only a shallow
  // "is everything present" check — the form itself already enforces each
  // field's own Yes/No-dependent requirement before it ever gets here.
  const { data: category } = await supabase
    .from('payment_categories')
    .select('target_group')
    .eq('id', categoryId)
    .single();
  let planDetails: Record<string, unknown> | null = null;
  if (category?.target_group === 'careplan') {
    if (!planDetailsRaw) throw new Error('Careplan plan details are required.');
    try {
      planDetails = JSON.parse(planDetailsRaw);
    } catch {
      throw new Error('Careplan plan details are invalid.');
    }
    const required = ['planName', 'duration', 'diagnostics', 'consultation', 'coaches', 'drug', 'bca', 'cgm'];
    if (!planDetails || required.some((k) => !(k in planDetails!))) {
      throw new Error('Careplan plan details are incomplete.');
    }
  }

  const ext = screenshot.name.split('.').pop() || 'png';
  const path = `${leadId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('payment-screenshots')
    .upload(path, screenshot, { contentType: screenshot.type });
  if (uploadError) throw new Error(uploadError.message);

  const { error: paymentError } = await supabase.from('payments').insert({
    lead_id: leadId,
    status: 'Paid',
    amount,
    payment_date: paymentDate,
    payment_ref: paymentRef,
    screenshot_path: path,
    remarks,
    category_id: categoryId,
    recorded_by: user.id,
    plan_details: planDetails,
  });
  if (paymentError) throw new Error(paymentError.message);

  await supabase.from('leads').update({ payment_status: 'Paid', status: 'Renewed' }).eq('id', leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  revalidatePath('/revenue');
}

// Two-step verification: a coach records a payment (always starts
// "pending"); only someone with Verify Access (granted in Settings by the
// super admin) or the super admin themselves can mark it verified/rejected.
// RLS backs this up — payments_verify_update only allows the update at all
// if can_verify_payments() is true for the signed-in user.
export async function verifyPayment(
  paymentId: string,
  leadId: string,
  decision: 'verified' | 'rejected',
  note?: string,
  paymentRef?: string
) {
  const user = await getCurrentUser();
  if (!user.canVerifyPayments) {
    throw new Error('You do not have Verify Access for payments. Ask your super admin to grant it.');
  }

  const supabase = createServerSupabase();

  const updates: Record<string, unknown> = {
    verification_status: decision,
    verified_by: user.id,
    verified_at: new Date().toISOString(),
    verification_note: note?.trim() || null,
  };

  // Payment ID isn't mandatory when a coach records a payment, but it IS
  // mandatory before anyone can mark it Verified — the verifier must fill
  // it in here if the coach didn't already.
  if (decision === 'verified') {
    const trimmedRef = paymentRef?.trim();
    if (trimmedRef) {
      updates.payment_ref = trimmedRef;
    } else {
      const { data: existing } = await supabase
        .from('payments')
        .select('payment_ref')
        .eq('id', paymentId)
        .single();
      if (!existing?.payment_ref) {
        throw new Error('Payment ID is required to verify this payment.');
      }
    }
  }

  const { error } = await supabase.from('payments').update(updates).eq('id', paymentId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/revenue');
}

export async function reassignCoach(leadId: string, coachId: string | null) {
  const user = await getCurrentUser();
  if (user.role !== 'admin') throw new Error('Only Admin can reassign leads.');

  const supabase = createServerSupabase();
  const { error } = await supabase.from('leads').update({ coach_id: coachId }).eq('id', leadId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
}

export async function updatePriority(leadId: string, priority: string) {
  const supabase = createServerSupabase();
  const { error } = await supabase.from('leads').update({ priority }).eq('id', leadId);
  if (error) throw new Error(error.message);
  revalidatePath(`/leads/${leadId}`);
}
