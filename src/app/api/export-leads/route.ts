import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';

// CSV export — open to BOTH Admin and Coach. There's no separate access
// check here beyond being signed in, because the actual restriction is RLS
// on the `lead_overview`/`interactions`/`payments` tables: this route uses
// the signed-in user's own cookie-based client, so a coach's query simply
// never returns any other coach's rows (same as every other page in the
// app) and their CSV only ever contains leads they can already see.
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const supabase = createServerSupabase();
  const params = request.nextUrl.searchParams;

  const month = params.get('month');
  if (!month) {
    return NextResponse.json({ error: 'month is required' }, { status: 400 });
  }

  let query = supabase.from('lead_overview').select('*').eq('month_cohort', month).eq('active', true);
  const coach = params.get('coach');
  if (coach === 'unassigned') query = query.is('source_coach_name', null);
  else if (coach) query = query.eq('source_coach_name', coach);
  const status = params.get('status');
  if (status) query = query.eq('status', status);
  const priority = params.get('priority');
  if (priority) query = query.eq('priority', priority);
  const payment = params.get('payment');
  if (payment === 'Pending') query = query.eq('latest_payment_status', 'Pending');
  else if (payment === 'Paid_unverified')
    query = query.eq('latest_payment_status', 'Paid').eq('latest_verification_status', 'pending');
  else if (payment === 'Paid_verified')
    query = query.eq('latest_payment_status', 'Paid').eq('latest_verification_status', 'verified');
  else if (payment === 'Paid_rejected')
    query = query.eq('latest_payment_status', 'Paid').eq('latest_verification_status', 'rejected');
  const expiryFrom = params.get('expiry_from');
  if (expiryFrom) query = query.gte('plan_expiry_date', expiryFrom);
  const expiryTo = params.get('expiry_to');
  if (expiryTo) query = query.lte('plan_expiry_date', expiryTo);
  const followupFrom = params.get('followup_from');
  if (followupFrom) query = query.gte('next_followup_date', followupFrom);
  const followupTo = params.get('followup_to');
  if (followupTo) query = query.lte('next_followup_date', followupTo);
  const q = params.get('q');
  if (q) query = query.or(`patient_name.ilike.%${q}%,mobile_number.ilike.%${q}%`);

  const { data: leads, error } = await query.order('plan_expiry_date', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const leadIds = (leads ?? []).map((l) => l.id);

  // Full call history and payment history for exactly these leads — RLS on
  // both tables applies here too, so a coach never pulls another coach's
  // interactions/payments even if they somehow had a lead id for one.
  const { data: interactions } = leadIds.length
    ? await supabase
        .from('interactions')
        .select('lead_id, attempt_number, call_datetime, outcome, comment')
        .in('lead_id', leadIds)
        .order('attempt_number', { ascending: true })
    : { data: [] };

  const { data: payments } = leadIds.length
    ? await supabase
        .from('payments')
        .select('lead_id, status, amount, payment_date, verification_status, payment_categories(name)')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: true })
    : { data: [] };

  const interactionsByLead = new Map<string, any[]>();
  for (const i of interactions ?? []) {
    if (!interactionsByLead.has(i.lead_id)) interactionsByLead.set(i.lead_id, []);
    interactionsByLead.get(i.lead_id)!.push(i);
  }
  const paymentsByLead = new Map<string, any[]>();
  for (const p of payments ?? []) {
    if (!paymentsByLead.has(p.lead_id)) paymentsByLead.set(p.lead_id, []);
    paymentsByLead.get(p.lead_id)!.push(p);
  }

  const header = [
    'Patient Name',
    'Mobile Number',
    'Coach',
    'Programme',
    'Plan Expiry',
    'Lead Status',
    'Priority',
    'Total Attempts',
    'All Attempts (date: outcome / comment)',
    'Next Follow-up',
    'Payment Status',
    'Payment Details (amount, category, verification)',
  ];

  const rows = (leads ?? []).map((lead: any) => {
    const theirInteractions = interactionsByLead.get(lead.id) ?? [];
    const theirPayments = paymentsByLead.get(lead.id) ?? [];

    const attemptsText = theirInteractions
      .map(
        (i) =>
          `#${i.attempt_number} ${i.call_datetime ? i.call_datetime.slice(0, 10) : ''}: ${i.outcome}${
            i.comment ? ` (${i.comment})` : ''
          }`
      )
      .join(' | ');

    const paymentsText = theirPayments
      .map(
        (p) =>
          `₹${p.amount ?? 0}${p.payment_categories?.name ? ` - ${p.payment_categories.name}` : ''} [${p.verification_status}]${
            p.payment_date ? ` on ${p.payment_date}` : ''
          }`
      )
      .join(' | ');

    return [
      lead.patient_name,
      lead.mobile_number,
      lead.source_coach_name ?? '',
      lead.programme ?? '',
      lead.plan_expiry_date ?? '',
      lead.status,
      lead.priority,
      lead.total_attempts ?? 0,
      attemptsText,
      lead.next_followup_date ?? '',
      lead.latest_payment_status ?? '',
      paymentsText,
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mysaathi-leads-${month}-${user.role}.csv"`,
    },
  });
}
