import { requireAdmin } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { currentMonthCohort } from '@/lib/months';
import MonthTabs from '@/components/MonthTabs';
import StatCard from '@/components/StatCard';
import { findApplicableRule, calculateIncentive, findApplicableTiers, calculateTargetTierIncentive } from '@/lib/incentive';

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: { month?: string; coach?: string; programme?: string };
}) {
  await requireAdmin();
  const supabase = createServerSupabase();

  const { data: monthRows } = await supabase
    .from('leads')
    .select('month_cohort')
    .order('month_cohort', { ascending: false });
  const availableMonths = Array.from(new Set((monthRows ?? []).map((r) => r.month_cohort)));
  if (availableMonths.length === 0) availableMonths.push(currentMonthCohort());
  const activeMonth = searchParams.month ?? availableMonths[0];

  let leadsQuery = supabase.from('leads').select('*, coaches(id, display_name)').eq('month_cohort', activeMonth);
  if (searchParams.coach) leadsQuery = leadsQuery.eq('coach_id', searchParams.coach);
  if (searchParams.programme) leadsQuery = leadsQuery.eq('programme', searchParams.programme);
  const { data: leads } = await leadsQuery;
  const allLeads = leads ?? [];

  const { data: allPayments } = await supabase
    .from('payments')
    .select('*, payment_categories(name, kind)')
    .eq('status', 'Paid')
    .in('lead_id', allLeads.map((l) => l.id).length ? allLeads.map((l) => l.id) : ['00000000-0000-0000-0000-000000000000']);

  // Revenue and incentive only ever count VERIFIED payments — a payment a
  // coach just recorded sits in "pending" until someone with Verify Access
  // confirms it, so it can't inflate these numbers until then.
  const payments = (allPayments ?? []).filter((p: any) => p.verification_status === 'verified');
  const pendingVerificationCount = (allPayments ?? []).filter(
    (p: any) => p.verification_status === 'pending'
  ).length;

  const { data: incentiveRules } = await supabase.from('incentive_settings').select('*');
  const { data: coaches } = await supabase.from('coaches').select('id, display_name').order('display_name');
  const { data: allCategories } = await supabase.from('payment_categories').select('*');
  const { data: targetTiers } = await supabase.from('incentive_target_tiers').select('*');

  // A category is either "simple_percentage" (the existing incentive_settings
  // rule, by % or fixed amount) or "target_tiered" (e.g. Careplan) — those
  // never use incentive_settings at all; their rate depends on each coach's
  // own lead-conversion % this month (computed per coach below).
  const targetTieredCategoryIds = new Set(
    (allCategories ?? []).filter((c) => c.incentive_mode === 'target_tiered').map((c) => c.id)
  );

  const totalAssigned = allLeads.length;
  const totalRenewals = allLeads.filter((l) => l.status === 'Renewed').length;
  const totalRevenue = (payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const pendingPayments = allLeads.filter((l) => l.payment_status === 'Pending').length;
  const lostLeads = allLeads.filter((l) => ['Lost', 'Not Interested', 'Not Reachable'].includes(l.status)).length;
  const conversionRate = totalAssigned ? ((totalRenewals / totalAssigned) * 100).toFixed(1) : '0.0';

  const coachRows = (coaches ?? []).map((coach) => {
    const theirLeads = allLeads.filter((l) => l.coach_id === coach.id);
    const theirPayments = (payments ?? []).filter((p) =>
      theirLeads.some((l) => l.id === p.lead_id)
    );
    const revenue = theirPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const renewals = theirLeads.filter((l) => l.status === 'Renewed').length;

    let incentiveTotal = 0;
    for (const p of theirPayments) {
      // Target-tiered categories (e.g. Careplan) never use the simple
      // %/fixed incentive_settings rule — they're handled separately below.
      if (p.category_id && targetTieredCategoryIds.has(p.category_id)) continue;
      // The rule lookup is keyed on the active MONTH TAB, not the payment's
      // own date — everything on this page is already scoped to one month,
      // so changing a month's rule later never touches another month.
      const rule = findApplicableRule(incentiveRules ?? [], p.category_id ?? null, activeMonth);
      incentiveTotal += calculateIncentive(rule, Number(p.amount ?? 0)).amount;
    }

    // Target-tiered breakdown: achieved value is either a % (this coach's
    // verified payments in this category ÷ their own "Active" sheet Column I
    // leads this month) or a flat count, depending on how the ladder for
    // this category+month was set up. A % ladder with 0 Active leads is left
    // out entirely — there's nothing meaningful to show (and nothing to
    // divide by); a Count ladder has no such dependency.
    const targetBreakdown: {
      category: string;
      activeLeads: number;
      converted: number;
      targetType: 'percentage' | 'count';
      achievedValue: number;
      rate: number;
      revenue: number;
      incentive: number;
    }[] = [];
    const activeLeadsCount = theirLeads.filter((l) => l.lead_master_status === 'Active').length;
    for (const cat of (allCategories ?? []).filter((c) => c.incentive_mode === 'target_tiered')) {
      const ladder = findApplicableTiers(targetTiers ?? [], cat.id, activeMonth);
      const targetType = ladder[0]?.target_type ?? 'percentage';
      if (targetType === 'percentage' && activeLeadsCount === 0) continue;

      const catPayments = theirPayments.filter((p) => p.category_id === cat.id);
      const catRevenue = catPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
      const achievedValue =
        targetType === 'count' ? catPayments.length : (catPayments.length / activeLeadsCount) * 100;
      const tierResult = calculateTargetTierIncentive(ladder, achievedValue, catRevenue);
      incentiveTotal += tierResult.amount;
      targetBreakdown.push({
        category: cat.name,
        activeLeads: activeLeadsCount,
        converted: catPayments.length,
        targetType,
        achievedValue,
        rate: tierResult.rate,
        revenue: catRevenue,
        incentive: tierResult.amount,
      });
    }

    return {
      coach: coach.display_name,
      assigned: theirLeads.length,
      renewals,
      conversion: theirLeads.length ? ((renewals / theirLeads.length) * 100).toFixed(1) : '0.0',
      revenue,
      incentive: incentiveTotal,
      targetBreakdown,
    };
  });

  const categoryRows = Object.values(
    (payments ?? []).reduce((acc: Record<string, any>, p: any) => {
      const key = p.category_id ?? 'uncategorised';
      const name = p.payment_categories?.name ?? 'Uncategorised';
      if (!acc[key]) acc[key] = { name, revenue: 0, count: 0, incentive: 0 };
      acc[key].revenue += Number(p.amount ?? 0);
      acc[key].count += 1;
      if (p.category_id && targetTieredCategoryIds.has(p.category_id)) return acc; // added from coachRows below
      const rule = findApplicableRule(incentiveRules ?? [], p.category_id ?? null, activeMonth);
      acc[key].incentive += calculateIncentive(rule, Number(p.amount ?? 0)).amount;
      return acc;
    }, {})
  );
  // Fold each coach's target-tiered incentive into the matching category row
  // — the aggregate % across all coaches wouldn't mean the same thing as
  // each coach's own tier, so this is summed up from the per-coach numbers
  // computed above rather than recalculated company-wide.
  for (const row of coachRows) {
    for (const tb of row.targetBreakdown) {
      const match = (categoryRows as any[]).find((r) => r.name === tb.category);
      if (match) match.incentive += tb.incentive;
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Revenue &amp; Incentives</h1>
      <p className="text-sm text-slate-500 mb-4">Admin-only view across all coaches</p>

      <MonthTabs availableMonths={availableMonths} activeMonth={activeMonth} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Assigned Leads" value={totalAssigned} />
        <StatCard label="Total Renewals" value={totalRenewals} accent="green" />
        <StatCard label="Total Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} accent="green" />
        <StatCard label="Renewal Conversion Rate" value={`${conversionRate}%`} accent="blue" />
        <StatCard label="Verified Transactions" value={payments.length} accent="purple" />
        <StatCard label="Pending Verification" value={pendingVerificationCount} accent="amber" />
        <StatCard label="Pending Payments" value={pendingPayments} accent="amber" />
        <StatCard label="Lost Leads" value={lostLeads} accent="red" />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Coach-wise performance</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Coach</th>
              <th className="text-right">Assigned Leads</th>
              <th className="text-right">Renewals</th>
              <th className="text-right">Conversion %</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Incentive</th>
            </tr>
          </thead>
          <tbody>
            {coachRows.map((r) => (
              <tr key={r.coach}>
                <td className="font-medium text-slate-700">{r.coach}</td>
                <td className="text-right">{r.assigned}</td>
                <td className="text-right">{r.renewals}</td>
                <td className="text-right">{r.conversion}%</td>
                <td className="text-right">₹{r.revenue.toLocaleString('en-IN')}</td>
                <td className="text-right font-medium text-brand-700">
                  ₹{r.incentive.toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-400 mt-3">
          Revenue and Incentive here only include <strong>verified</strong> payments — a payment
          a coach just recorded doesn&apos;t count until someone with Verify Access confirms it on
          the lead&apos;s page. Incentive is then calculated using the rule configured in Settings
          that matches that payment&apos;s Product/Service category (falling back to the default
          rule), as of the payment date.
        </p>
      </div>

      <div className="card overflow-x-auto mt-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Revenue by Product/Service</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Category</th>
              <th className="text-right">Transactions</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Incentive</th>
            </tr>
          </thead>
          <tbody>
            {categoryRows.map((r: any) => (
              <tr key={r.name}>
                <td className="font-medium text-slate-700">{r.name}</td>
                <td className="text-right">{r.count}</td>
                <td className="text-right">₹{r.revenue.toLocaleString('en-IN')}</td>
                <td className="text-right font-medium text-brand-700">
                  ₹{r.incentive.toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
            {categoryRows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-slate-400 py-4">
                  No paid transactions this month yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {coachRows.some((r) => r.targetBreakdown.length > 0) && (
        <div className="card overflow-x-auto mt-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Target achievement</h2>
          <table className="table-base">
            <thead>
              <tr>
                <th>Coach</th>
                <th>Category</th>
                <th className="text-right">Active Leads</th>
                <th className="text-right">Converted</th>
                <th className="text-right">Achieved</th>
                <th className="text-right">Tier Rate</th>
                <th className="text-right">Incentive</th>
              </tr>
            </thead>
            <tbody>
              {coachRows.flatMap((r) =>
                r.targetBreakdown.map((tb) => (
                  <tr key={`${r.coach}-${tb.category}`}>
                    <td className="font-medium text-slate-700">{r.coach}</td>
                    <td className="text-slate-600">{tb.category}</td>
                    <td className="text-right">{tb.activeLeads}</td>
                    <td className="text-right">{tb.converted}</td>
                    <td className="text-right">
                      {tb.targetType === 'count' ? tb.achievedValue : `${tb.achievedValue.toFixed(1)}%`}
                    </td>
                    <td className="text-right">{tb.rate}%</td>
                    <td className="text-right font-medium text-brand-700">
                      ₹{tb.incentive.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 mt-3">
            Coaches with 0 Active leads this month aren&apos;t shown here — there&apos;s nothing to
            divide by. Active/Inactive comes from the sheet&apos;s own Column I, separate from the
            portal&apos;s workflow status.
          </p>
        </div>
      )}
    </div>
  );
}
