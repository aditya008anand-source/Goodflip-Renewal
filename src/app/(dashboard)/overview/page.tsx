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
    .order('month_cohort', { ascending: false });

  const availableMonths = Array.from(
    new Set((monthRows ?? []).map((r) => r.month_cohort))
  );
  if (availableMonths.length === 0) availableMonths.push(currentMonthCohort());

  const activeMonth = searchParams.month ?? availableMonths[0];

  let query = supabase.from('leads').select('*').eq('month_cohort', activeMonth);
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

  let totalRevenue = 0;
  if (user.role === 'admin' && allLeads.length > 0) {
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, status, lead_id')
      .eq('status', 'Paid')
      .in('lead_id', allLeads.map((l) => l.id));
    totalRevenue = (payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  }

  // Coach-wise summary (admin only)
  let coachSummary: { name: string; assigned: number; renewed: number }[] = [];
  if (user.role === 'admin') {
    const { data: coaches } = await supabase.from('coaches').select('id, display_name');
    coachSummary = (coaches ?? []).map((c) => {
      const theirLeads = allLeads.filter((l) => l.coach_id === c.id);
      return {
        name: c.display_name,
        assigned: theirLeads.length,
        renewed: theirLeads.filter((l) => l.status === 'Renewed').length,
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
              </tr>
            </thead>
            <tbody>
              {coachSummary.map((c) => (
                <tr key={c.name}>
                  <td className="font-medium text-slate-700">{c.name}</td>
                  <td>{c.assigned}</td>
                  <td>{c.renewed}</td>
                  <td>{c.assigned ? ((c.renewed / c.assigned) * 100).toFixed(1) : '0.0'}%</td>
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
