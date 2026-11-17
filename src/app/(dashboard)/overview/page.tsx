import { getCurrentUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { currentMonthCohort } from '@/lib/months';
import MonthTabs from '@/components/MonthTabs';
import StatCard from '@/components/StatCard';
import Link from 'next/link';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const user = await getCurrentUser();
  const supabase = createServerSupabase();

  const { data: monthRows } = await supabase
    .from('leads')
    .select('month_cohort')
    .eq('active', true)
    .order('month_cohort', { ascending: false });

  const availableMonths = Array.from(
    new Set((monthRows ?? []).map((r) => r.month_cohort))
  );
  if (availableMonths.length === 0) availableMonths.push(currentMonthCohort());

  const activeMonth = searchParams.month ?? availableMonths[0];

  let query = supabase.from('leads').select('*').eq('month_cohort', activeMonth).eq('active', true);
  const { data: leads } = await query;
  const allLeads = leads ?? [];

  const totalLeads = allLeads.length;
  const contacted = allLeads.filter((l) => l.status !== 'New' && l.status !== 'Not Contacted').length;
  const followUpsPending = allLeads.filter(
    (l) => l.status === 'Follow-up Required'
  ).length;
  const interested = allLeads.filter((l) => l.status === 'Interested').length;
  const paymentPending = allLeads.filter((l) => l.payment_status === 'Pending' && l.status !== 'Lost').length;
  const renewed = allLeads.filter((l) => l.status === 'Renewed').length;

  // Only VERIFIED payments count as revenue — matches the Revenue page
  // exactly (previously this counted every payments.status === 'Paid' row
  // regardless of verification, which inflated this number versus Revenue).
  let totalRevenue = 0;
  let verifiedPayments: { amount: number | null; lead_id: string }[] = [];
  if (user.role === 'admin' && allLeads.length > 0) {
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, lead_id')
      .eq('status', 'Paid')
      .eq('verification_status', 'verified')
      .in('lead_id', allLeads.map((l) => l.id));
    verifiedPayments = payments ?? [];
    totalRevenue = verifiedPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  }

  // Coach-wise summary (admin only) — coach identity is the sheet's own
  // "Renewal Coach" name, not the list of invited/logged-in accounts.
  let coachSummary: { name: string; assigned: number; renewed: number; revenue: number }[] = [];
  if (user.role === 'admin') {
    const coachNames = Array.from(
      new Set(allLeads.map((l: any) => l.source_coach_name).filter((n: string | null): n is string => !!n))
    ).sort();
    coachSummary = coachNames.map((name) => {
      const theirLeads = allLeads.filter((l: any) => l.source_coach_name === name);
      const theirLeadIds = new Set(theirLeads.map((l) => l.id));
      const revenue = verifiedPayments
        .filter((p) => theirLeadIds.has(p.lead_id))
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
      return {
        name,
        assigned: theirLeads.length,
        renewed: theirLeads.filter((l) => l.status === 'Renewed').length,
        revenue,
      };
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        {user.role === 'admin' ? 'All coaches' : 'Your assigned leads'}
      </p>

      <MonthTabs availableMonths={availableMonths} activeMonth={activeMonth} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total Leads" value={totalLeads} />
        <StatCard label="Contacted" value={contacted} accent="blue" />
        <StatCard label="Follow-ups Pending" value={followUpsPending} accent="amber" />
        <StatCard label="Interested" value={interested} accent="purple" />
        <StatCard label="Payment Pending" value={paymentPending} accent="amber" />
        <StatCard label="Renewed" value={renewed} accent="green" />
        {user.role === 'admin' && (
          <StatCard
            label="Total Revenue"
            value={`₹${totalRevenue.toLocaleString('en-IN')}`}
            accent="green"
          />
        )}
      </div>

      {user.role === 'admin' && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Coach-wise performance</h2>
          <table className="table-base">
            <thead>
              <tr>
                <th>Coach</th>
                <th>Assigned Leads</th>
                <th>Renewals</th>
                <th>Conversion %</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {coachSummary.map((c) => (
                <tr key={c.name}>
                  <td className="font-medium text-slate-700">{c.name}</td>
                  <td>{c.assigned}</td>
                  <td>{c.renewed}</td>
                  <td>{c.assigned ? ((c.renewed / c.assigned) * 100).toFixed(1) : '0.0'}%</td>
                  <td>₹{c.revenue.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <Link href="/leads" className="btn-secondary">
          Go to Renewal Leads →
        </Link>
      </div>
    </div>
  );
}
