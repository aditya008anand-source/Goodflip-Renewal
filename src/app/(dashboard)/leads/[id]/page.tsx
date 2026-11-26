import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { getCurrentUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import LogAttemptForm from '@/components/forms/LogAttemptForm';
import PaymentForm from '@/components/forms/PaymentForm';
import PaymentVerifyActions from '@/components/forms/PaymentVerifyActions';
import ReassignCoachSelect from '@/components/forms/ReassignCoachSelect';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const supabase = createServerSupabase();

  const { data: lead } = await supabase
    .from('leads')
    .select('*, coaches(display_name)')
    .eq('id', params.id)
    .single();

  if (!lead) notFound();

  // Same month's other leads, so you can click straight to the next one
  // instead of going back to the list each time. RLS already limits a
  // coach to their own leads here, same as the main Renewal Leads page.
  const { data: siblingLeads } = await supabase
    .from('lead_overview')
    .select('id, patient_name, mobile_number, status, plan_expiry_date')
    .eq('month_cohort', lead.month_cohort)
    .eq('active', true)
    .order('plan_expiry_date', { ascending: true });

  const { data: categories } = await supabase
    .from('payment_categories')
    .select('*')
    .eq('active', true)
    .order('kind')
    .order('name');

  const { data: interactions } = await supabase
    .from('interactions')
    .select('*, users(name)')
    .eq('lead_id', params.id)
    .order('attempt_number', { ascending: false });

  const { data: payments } = await supabase
    .from('payments')
    .select('*, payment_categories(name)')
    .eq('lead_id', params.id)
    .order('created_at', { ascending: false });

  // Signed URLs for any uploaded screenshots (bucket is private).
  const paymentsWithUrls = await Promise.all(
    (payments ?? []).map(async (p) => {
      if (!p.screenshot_path) return { ...p, screenshotUrl: null };
      const { data } = await supabase.storage
        .from('payment-screenshots')
        .createSignedUrl(p.screenshot_path, 60 * 10);
      return { ...p, screenshotUrl: data?.signedUrl ?? null };
    })
  );

  let coaches: { id: string; display_name: string }[] = [];
  if (user.role === 'admin') {
    const { data } = await supabase.from('coaches').select('id, display_name').order('display_name');
    coaches = data ?? [];
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="lg:w-64 shrink-0">
        <div className="card lg:sticky lg:top-4 max-h-[80vh] overflow-y-auto p-0">
          <p className="text-xs font-semibold text-slate-500 px-3 py-2 border-b border-slate-100">
            This month&apos;s leads ({siblingLeads?.length ?? 0})
          </p>
          <div>
            {(siblingLeads ?? []).map((l) => (
              <Link
                key={l.id}
                href={`/leads/${l.id}`}
                className={`block px-3 py-2 border-b border-slate-50 text-sm ${
                  l.id === lead.id ? 'bg-brand-700/10 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <p className="truncate">{l.patient_name}</p>
                <p className="text-xs text-slate-400">{l.mobile_number} · {l.status}</p>
              </Link>
            ))}
            {(siblingLeads ?? []).length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-4">No other leads this month.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-w-0">
      <div className="lg:col-span-1 space-y-4">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{lead.patient_name}</h1>
              <p className="text-sm text-slate-500">{lead.mobile_number}</p>
            </div>
            <PriorityBadge priority={lead.priority} />
          </div>

          {lead.active === false && (
            <div className="mt-3 rounded-md bg-slate-100 border border-slate-200 px-3 py-2 text-xs text-slate-600">
              This lead was removed from the source sheet on a later sync, so it no longer
              appears in any list — its history below is kept for reference.
            </div>
          )}

          {lead.needs_review && (
            <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              Flagged during import: {lead.review_note ?? 'needs manual review'}
            </div>
          )}

          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Programme" value={lead.programme ?? '—'} />
            <Row label="Condition" value={lead.condition ?? '—'} />
            <Row label="Clinical Discipline" value={lead.clinical_discipline ?? '—'} />
            <Row label="Team" value={lead.team ?? '—'} />
            <Row
              label="Plan Start"
              value={lead.plan_start_date ? format(new Date(lead.plan_start_date), 'dd MMM yyyy') : '—'}
            />
            <Row
              label="Plan Expiry"
              value={lead.plan_expiry_date ? format(new Date(lead.plan_expiry_date), 'dd MMM yyyy') : '—'}
            />
            <Row
              label="Old Plan Price"
              value={lead.old_plan_price != null ? `₹${Number(lead.old_plan_price).toLocaleString('en-IN')}` : '—'}
            />
            <div className="flex items-center justify-between py-1">
              <dt className="text-slate-500">Status</dt>
              <dd>
                <StatusBadge status={lead.status} />
              </dd>
            </div>
            <div className="flex items-center justify-between py-1">
              <dt className="text-slate-500">Coach</dt>
              <dd>
                {user.role === 'admin' ? (
                  <ReassignCoachSelect
                    leadId={lead.id}
                    coaches={coaches}
                    currentCoachId={lead.coach_id}
                  />
                ) : (
                  lead.coaches?.display_name ?? '—'
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Record payment</h2>
          <PaymentForm leadId={lead.id} categories={categories ?? []} />
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Log a new attempt</h2>
          <LogAttemptForm leadId={lead.id} />
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            Call &amp; follow-up history ({interactions?.length ?? 0} attempts)
          </h2>
          <div className="space-y-3">
            {(interactions ?? []).length === 0 && (
              <p className="text-sm text-slate-400">No attempts logged yet.</p>
            )}
            {(interactions ?? []).map((i: any) => (
              <div key={i.id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span className="font-medium text-slate-700">Attempt #{i.attempt_number}</span>
                  <span>{format(new Date(i.call_datetime), 'dd MMM yyyy, h:mm a')}</span>
                </div>
                <p className="text-sm text-slate-800">{i.outcome}</p>
                {i.comment && <p className="text-sm text-slate-500 mt-0.5">{i.comment}</p>}
                <div className="flex items-center justify-between mt-1.5 text-xs text-slate-400">
                  <span>
                    {i.next_followup_date
                      ? `Next follow-up: ${format(new Date(i.next_followup_date), 'dd MMM yyyy')}`
                      : ''}
                  </span>
                  <span>Updated by {i.users?.name ?? i.updated_by_name ?? 'migrated record'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Payment history</h2>
          <div className="space-y-3">
            {paymentsWithUrls.length === 0 && (
              <p className="text-sm text-slate-400">No payment records yet.</p>
            )}
            {paymentsWithUrls.map((p) => (
              <div key={p.id} className="border border-slate-100 rounded-lg p-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {p.status} {p.amount ? `· ₹${Number(p.amount).toLocaleString('en-IN')}` : ''}
                    {p.payment_categories?.name ? ` · ${p.payment_categories.name}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.payment_date ? format(new Date(p.payment_date), 'dd MMM yyyy') : ''}
                    {p.payment_ref ? ` · Ref: ${p.payment_ref}` : ''}
                  </p>
                  {p.remarks && <p className="text-xs text-slate-400 mt-1">{p.remarks}</p>}
                  <p className="text-xs mt-1">
                    <span
                      className={
                        p.verification_status === 'verified'
                          ? 'text-green-700 font-medium'
                          : p.verification_status === 'rejected'
                          ? 'text-red-600 font-medium'
                          : 'text-amber-600 font-medium'
                      }
                    >
                      {p.verification_status === 'verified'
                        ? 'Verified'
                        : p.verification_status === 'rejected'
                        ? 'Rejected'
                        : 'Pending verification'}
                    </span>
                    {p.verification_note ? ` — ${p.verification_note}` : ''}
                  </p>
                  {user.canVerifyPayments && p.verification_status === 'pending' && (
                    <PaymentVerifyActions paymentId={p.id} leadId={lead.id} paymentRef={p.payment_ref} />
                  )}
                </div>
                {p.screenshotUrl && (
                  <a
                    href={p.screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand-700 font-medium shrink-0 ml-3"
                  >
                    View screenshot
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium text-right">{value}</dd>
    </div>
  );
}
