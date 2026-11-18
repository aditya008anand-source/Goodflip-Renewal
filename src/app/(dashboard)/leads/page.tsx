import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { currentMonthCohort } from '@/lib/months';
import MonthTabs from '@/components/MonthTabs';
import LeadsFilters from '@/components/LeadsFilters';
import ExportCsvButton from '@/components/ExportCsvButton';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { format } from 'date-fns';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const user = await getCurrentUser();
  const supabase = createServerSupabase();

  const { data: monthRows } = await supabase
    .from('leads')
    .select('month_cohort')
    .eq('active', true)
    .order('month_cohort', { ascending: false });
  const availableMonths = Array.from(new Set((monthRows ?? []).map((r) => r.month_cohort)));
  if (availableMonths.length === 0) availableMonths.push(currentMonthCohort());
  // Default to the actual current month, not just whichever month has the
  // latest data (e.g. next month's leads already synced in ahead of time)
  // — a coach/admin opening the dashboard should land on "now" unless they
  // explicitly pick a different tab.
  const defaultMonth = availableMonths.includes(currentMonthCohort())
    ? currentMonthCohort()
    : availableMonths[0];
  const activeMonth = searchParams.month ?? defaultMonth;

  // Coach list is the sheet's own "Renewal Coach" names, not the list of
  // who has been invited/has a login — a coach with leads in the sheet but
  // no portal account yet still needs to show up here.
  const { data: coachNameRows } = await supabase
    .from('leads')
    .select('source_coach_name')
    .not('source_coach_name', 'is', null);
  const coachNames = Array.from(
    new Set((coachNameRows ?? []).map((r) => r.source_coach_name as string))
  ).sort();

  let query = supabase
    .from('lead_overview')
    .select('*')
    .eq('month_cohort', activeMonth)
    .eq('active', true);

  if (searchParams.coach === 'unassigned') {
    query = query.is('source_coach_name', null);
  } else if (searchParams.coach) {
    query = query.eq('source_coach_name', searchParams.coach);
  }
  if (searchParams.status) query = query.eq('status', searchParams.status);
  if (searchParams.priority) query = query.eq('priority', searchParams.priority);
  if (searchParams.payment === 'Pending') {
    query = query.eq('latest_payment_status', 'Pending');
  } else if (searchParams.payment === 'Paid_unverified') {
    query = query.eq('latest_payment_status', 'Paid').eq('latest_verification_status', 'pending');
  } else if (searchParams.payment === 'Paid_verified') {
    query = query.eq('latest_payment_status', 'Paid').eq('latest_verification_status', 'verified');
  } else if (searchParams.payment === 'Paid_rejected') {
    query = query.eq('latest_payment_status', 'Paid').eq('latest_verification_status', 'rejected');
  }
  if (searchParams.expiry_from) query = query.gte('plan_expiry_date', searchParams.expiry_from);
  if (searchParams.expiry_to) query = query.lte('plan_expiry_date', searchParams.expiry_to);
  if (searchParams.followup_from) query = query.gte('next_followup_date', searchParams.followup_from);
  if (searchParams.followup_to) query = query.lte('next_followup_date', searchParams.followup_to);
  if (searchParams.q) {
    const q = searchParams.q;
    query = query.or(
      `patient_name.ilike.%${q}%,mobile_number.ilike.%${q}%`
    );
  }

  const { data: leads, error } = await query.order('plan_expiry_date', { ascending: true });

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 mb-1">Renewal Leads</h1>
          <p className="text-sm text-slate-500 mb-4">
            {user.role === 'admin' ? 'All coaches' : 'Your assigned leads'}
          </p>
        </div>
        <ExportCsvButton activeMonth={activeMonth} />
      </div>

      <MonthTabs availableMonths={availableMonths} activeMonth={activeMonth} />

      <LeadsFilters coachNames={coachNames} isAdmin={user.role === 'admin'} />

      <div className="card overflow-x-auto">
        {error && <p className="text-sm text-red-600 mb-2">{error.message}</p>}
        <table className="table-base">
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>Mobile Number</th>
              {user.role === 'admin' && <th>Coach</th>}
              <th>Programme</th>
              <th>Plan Expiry</th>
              <th>Days to Expiry</th>
              <th>Priority</th>
              <th>Lead Status</th>
              <th>Last Attempt</th>
              <th>Attempts</th>
              <th>Next Follow-up</th>
              <th>Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50">
                <td className="font-medium text-slate-800">{lead.patient_name}</td>
                <td>{lead.mobile_number}</td>
                {user.role === 'admin' && <td>{lead.source_coach_name ?? '—'}</td>}
                <td className="text-slate-600">{lead.programme ?? '—'}</td>
                <td>
                  {lead.plan_expiry_date ? format(new Date(lead.plan_expiry_date), 'dd MMM yyyy') : '—'}
                </td>
                <td
                  className={
                    lead.days_to_expiry !== null && lead.days_to_expiry <= 7
                      ? 'text-red-600 font-medium'
                      : ''
                  }
                >
                  {lead.days_to_expiry ?? '—'}
                </td>
                <td>
                  <PriorityBadge priority={lead.priority} />
                </td>
                <td>
                  <StatusBadge status={lead.status} />
                </td>
                <td>
                  {lead.last_attempt_date ? format(new Date(lead.last_attempt_date), 'dd MMM') : '—'}
                </td>
                <td>{lead.total_attempts}</td>
                <td>
                  {lead.next_followup_date
                    ? format(new Date(lead.next_followup_date), 'dd MMM')
                    : '—'}
                </td>
                <td>
                  {lead.latest_payment_status}
                  {lead.latest_payment_status === 'Paid' && lead.latest_verification_status && (
                    <span className="text-xs text-slate-400"> ({lead.latest_verification_status})</span>
                  )}
                </td>
                <td>
                  <Link href={`/leads/${lead.id}`} className="text-brand-700 font-medium text-xs">
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(leads ?? []).length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center">No leads match these filters.</p>
        )}
      </div>
    </div>
  );
}
