import { getCurrentUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { currentMonthCohort } from '@/lib/months';
import MonthTabs from '@/components/MonthTabs';
import StatCard from '@/components/StatCard';
import BreakdownStatCard, { type BreakdownRow } from '@/components/BreakdownStatCard';
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

  // Revenue (₹) only ever counts VERIFIED payments — matches the Revenue
  // page exactly. But "is this renewal a Careplan renewal or something
  // else" is a question about the payment's CATEGORY, not whether it's
  // been verified yet — a Careplan payment sitting in "pending
  // verification" is still a Careplan renewal, just not counted in revenue
  // until verified. So we fetch every Paid payment (any verification
  // status) for classification, and keep a verified-only subset for ₹.
  let allPayments: {
    amount: number | null;
    lead_id: string;
    category_id: string | null;
    verification_status: string | null;
    payment_categories: { name: string } | null;
  }[] = [];
  let categories: { id: string; name: string; target_group: string | null }[] = [];
  if (user.role === 'admin' && allLeads.length > 0) {
    const { data: paymentRows } = await supabase
      .from('payments')
      .select('amount, lead_id, category_id, verification_status, payment_categories(name)')
      .eq('status', 'Paid')
      .in('lead_id', allLeads.map((l) => l.id));
    allPayments = (paymentRows ?? []) as any;

    const { data: cats } = await supabase.from('payment_categories').select('id, name, target_group');
    categories = cats ?? [];
  }
  const verifiedPayments = allPayments.filter((p) => p.verification_status === 'verified');
  const totalRevenue = verifiedPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  // Careplan group (its 3 team variants, pooled by target_group — see
  // migration-9) vs every other category, for the Renewed / Revenue
  // breakdown cards below.
  const careplanCategories = categories.filter((c) => c.target_group === 'careplan');
  const careplanCategoryIds = new Set(careplanCategories.map((c) => c.id));

  // Classification uses EVERY Paid payment regardless of verification —
  // only the ₹ amounts below are verified-only.
  const renewedLeads = allLeads.filter((l) => l.status === 'Renewed');
  const careplanRenewedLeadIds = new Set(
    allPayments.filter((p) => p.category_id && careplanCategoryIds.has(p.category_id)).map((p) => p.lead_id)
  );
  const careplanRenewedCount = renewedLeads.filter((l) => careplanRenewedLeadIds.has(l.id)).length;
  const careplanRenewedSubCounts = careplanCategories
    .map((c) => ({
      label: c.name,
      count: renewedLeads.filter((l) => allPayments.some((p) => p.lead_id === l.id && p.category_id === c.id))
        .length,
    }))
    .filter((c) => c.count > 0);

  const renewedBreakdown: BreakdownRow[] = [
    { label: 'Careplan', value: String(careplanRenewedCount), emphasize: true },
    // Only show the Careplan sub-category split when more than one of its
    // 3 team variants actually has a renewal this month — with just one
    // active, the sub-row would just repeat the "Careplan" line above it.
    ...(careplanRenewedSubCounts.length > 1
      ? careplanRenewedSubCounts.map((c) => ({ label: c.label, value: String(c.count), indent: true }))
      : []),
  ];

  const careplanRevenue = verifiedPayments
    .filter((p) => p.category_id && careplanCategoryIds.has(p.category_id))
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const careplanRevenueSubRows = careplanCategories
    .map((c) => ({
      label: c.name,
      amount: verifiedPayments
        .filter((p) => p.category_id === c.id)
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    }))
    .filter((c) => c.amount > 0);
  // Same rule as Renewed above: only break Careplan Revenue down by its 3
  // team variants when 2+ of them have verified revenue this month.
  const careplanRevenueBreakdown: BreakdownRow[] =
    careplanRevenueSubRows.length > 1
      ? careplanRevenueSubRows.map((c) => ({ label: c.label, value: `₹${c.amount.toLocaleString('en-IN')}` }))
      : [];

  const totalRevenueByCategory = new Map<string, number>();
  for (const p of verifiedPayments) {
    const name = p.payment_categories?.name ?? 'Uncategorised';
    totalRevenueByCategory.set(name, (totalRevenueByCategory.get(name) ?? 0) + Number(p.amount ?? 0));
  }
  const totalRevenueBreakdown: BreakdownRow[] = Array.from(totalRevenueByCategory.entries())
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ label: name, value: `₹${amount.toLocaleString('en-IN')}` }));

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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Total Leads" value={totalLeads} />
        <StatCard label="Contacted" value={contacted} accent="blue" />
        <StatCard label="Follow-ups Pending" value={followUpsPending} accent="amber" />
        <StatCard label="Interested" value={interested} accent="purple" />
        <StatCard label="Payment Pending" value={paymentPending} accent="amber" />
      </div>

      <div className={`grid grid-cols-1 ${user.role === 'admin' ? 'md:grid-cols-3' : 'md:grid-cols-1 max-w-sm'} gap-4 mb-8`}>
        <BreakdownStatCard label="Renewed" total={renewed} accent="green" breakdown={renewedBreakdown} />
        {user.role === 'admin' && (
          <>
            <BreakdownStatCard
              label="Careplan Revenue"
              total={`₹${careplanRevenue.toLocaleString('en-IN')}`}
              accent="purple"
              breakdown={careplanRevenueBreakdown}
              emptyText={careplanRevenue === 0 ? 'No Careplan revenue this month' : undefined}
            />
            <BreakdownStatCard
              label="Total Revenue"
              total={`₹${totalRevenue.toLocaleString('en-IN')}`}
              accent="green"
              breakdown={totalRevenueBreakdown}
              emptyText="No verified revenue this month"
            />
          </>
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
