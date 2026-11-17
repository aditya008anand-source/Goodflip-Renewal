import { Fragment } from 'react';
import { requireAdmin } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { currentMonthCohort } from '@/lib/months';
import MonthTabs from '@/components/MonthTabs';
import StatCard from '@/components/StatCard';
import BreakdownStatCard, { type BreakdownRow } from '@/components/BreakdownStatCard';
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
    .eq('active', true)
    .order('month_cohort', { ascending: false });
  const availableMonths = Array.from(new Set((monthRows ?? []).map((r) => r.month_cohort)));
  if (availableMonths.length === 0) availableMonths.push(currentMonthCohort());
  const activeMonth = searchParams.month ?? availableMonths[0];

  let leadsQuery = supabase
    .from('leads')
    .select('*')
    .eq('month_cohort', activeMonth)
    .eq('active', true);
  if (searchParams.coach) leadsQuery = leadsQuery.eq('source_coach_name', searchParams.coach);
  if (searchParams.programme) leadsQuery = leadsQuery.eq('programme', searchParams.programme);
  const { data: leads } = await leadsQuery;
  const allLeads = leads ?? [];

  // Coach identity here is the sheet's own "Renewal Coach" name, not the
  // list of invited/logged-in accounts — a coach with leads this month but
  // no portal account yet still gets a row.
  const coachNames = Array.from(
    new Set(allLeads.map((l: any) => l.source_coach_name).filter((n: string | null): n is string => !!n))
  ).sort();

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
  const { data: allCategories } = await supabase.from('payment_categories').select('*');
  const { data: targetTiers } = await supabase.from('incentive_target_tiers').select('*');

  // A category is either "simple_percentage" (the existing incentive_settings
  // rule, by % or fixed amount) or "target_tiered" (e.g. Careplan) — those
  // never use incentive_settings at all; their rate depends on each coach's
  // own lead-conversion % this month (computed per coach below).
  const targetTieredCategoryIds = new Set(
    (allCategories ?? []).filter((c) => c.incentive_mode === 'target_tiered').map((c) => c.id)
  );

  // Group target-tiered categories by target_group — categories sharing a
  // group (e.g. Careplan's 3 team variants) are pooled into one achievement
  // figure; a category with no target_group is its own group of one, label
  // = its own name, same as before this change.
  type TargetGroup = { label: string; categories: any[] };
  const targetTieredGroupMap = new Map<string, TargetGroup>();
  for (const c of (allCategories ?? []).filter((c: any) => c.incentive_mode === 'target_tiered')) {
    const key = (c as any).target_group ?? c.id;
    // A grouped label is the group key itself, title-cased (e.g.
    // 'careplan' -> 'Careplan') — deterministic regardless of which
    // category in the group the database happens to return first. An
    // ungrouped category (no target_group) just keeps its own name.
    const label = (c as any).target_group
      ? (c as any).target_group.replace(/\b\w/g, (ch: string) => ch.toUpperCase())
      : c.name;
    if (!targetTieredGroupMap.has(key)) targetTieredGroupMap.set(key, { label, categories: [] });
    targetTieredGroupMap.get(key)!.categories.push(c);
  }
  const targetTieredGroups: TargetGroup[] = Array.from(targetTieredGroupMap.values());

  const totalAssigned = allLeads.length;
  const totalRenewals = allLeads.filter((l) => l.status === 'Renewed').length;
  const totalRevenue = (payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const pendingPayments = allLeads.filter((l) => l.payment_status === 'Pending').length;
  const lostLeads = allLeads.filter((l) => ['Lost', 'Not Interested', 'Not Reachable'].includes(l.status)).length;
  const conversionRate = totalAssigned ? ((totalRenewals / totalAssigned) * 100).toFixed(1) : '0.0';

  // Renewed / Revenue broken into Careplan (its 3 team variants, pooled) vs
  // everything else — same split shown on the Overview page.
  const careplanCategories = (allCategories ?? []).filter((c: any) => targetTieredCategoryIds.has(c.id));
  const renewedLeadsThisMonth = allLeads.filter((l) => l.status === 'Renewed');
  const careplanRenewedLeadIds = new Set(
    payments.filter((p: any) => p.category_id && targetTieredCategoryIds.has(p.category_id)).map((p: any) => p.lead_id)
  );
  const careplanRenewedCount = renewedLeadsThisMonth.filter((l) => careplanRenewedLeadIds.has(l.id)).length;
  const othersRenewedCount = renewedLeadsThisMonth.length - careplanRenewedCount;
  const renewedBreakdown: BreakdownRow[] = [
    { label: 'Careplan', value: String(careplanRenewedCount), emphasize: true },
    ...careplanCategories
      .map((c: any) => ({
        label: c.name,
        value: String(
          renewedLeadsThisMonth.filter((l) =>
            payments.some((p: any) => p.lead_id === l.id && p.category_id === c.id)
          ).length
        ),
        indent: true,
      }))
      .filter((r) => r.value !== '0'),
    { label: 'Others', value: String(othersRenewedCount), emphasize: true },
  ];

  const careplanRevenueTotal = payments
    .filter((p: any) => p.category_id && targetTieredCategoryIds.has(p.category_id))
    .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
  const careplanRevenueBreakdown: BreakdownRow[] = careplanCategories
    .map((c: any) => ({
      label: c.name,
      amount: payments
        .filter((p: any) => p.category_id === c.id)
        .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0),
    }))
    .filter((c) => c.amount > 0)
    .map((c) => ({ label: c.label, value: `₹${c.amount.toLocaleString('en-IN')}` }));

  const coachRows = coachNames.map((name) => {
    const theirLeads = allLeads.filter((l: any) => l.source_coach_name === name);
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
    // verified payments in this GROUP of categories ÷ their own "Active"
    // sheet Column I leads this month) or a flat count, depending on how
    // the ladder for this group+month was set up. A % ladder with 0 Active
    // leads is left out entirely — there's nothing meaningful to show (and
    // nothing to divide by); a Count ladder has no such dependency.
    //
    // Categories sharing the same target_group (e.g. Careplan's 3 team
    // variants) are pooled here — a coach's achievement is based on ALL of
    // that group's payments combined, no matter which exact category a
    // payment got tagged with. A category with no target_group is its own
    // group of one, same as before.
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
    for (const group of targetTieredGroups) {
      const groupCategoryIds = group.categories.map((c) => c.id);
      // Only one category in the group needs an actual ladder configured
      // (the others can be left blank) — use whichever one has rows.
      let ladder: NonNullable<typeof targetTiers> = [];
      for (const cat of group.categories) {
        ladder = findApplicableTiers(targetTiers ?? [], cat.id, activeMonth);
        if (ladder.length > 0) break;
      }
      const targetType = ladder[0]?.target_type ?? 'percentage';
      if (targetType === 'percentage' && activeLeadsCount === 0) continue;

      const catPayments = theirPayments.filter((p) => groupCategoryIds.includes(p.category_id));
      const catRevenue = catPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
      const achievedValue =
        targetType === 'count' ? catPayments.length : (catPayments.length / activeLeadsCount) * 100;
      const tierResult = calculateTargetTierIncentive(ladder, achievedValue, catRevenue);
      incentiveTotal += tierResult.amount;
      targetBreakdown.push({
        category: group.label,
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
      coach: name,
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
  // Target-tiered incentive is NOT folded into "Revenue by Product/Service"
  // below — when a group pools multiple categories (e.g. Careplan's 3 team
  // variants), there's no single correct category to attribute that
  // incentive amount to. Each category in the group still shows its own
  // REVENUE there (so the Field/Inside Sales/plain split stays visible),
  // but its Incentive column stays 0 for any target-tiered category — the
  // one correct combined incentive number lives only in the "Target
  // achievement" table below, computed once per group.

  const totalRevenueBreakdown: BreakdownRow[] = categoryRows
    .filter((r: any) => r.revenue > 0)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .map((r: any) => ({ label: r.name, value: `₹${r.revenue.toLocaleString('en-IN')}` }));

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Revenue &amp; Incentives</h1>
      <p className="text-sm text-slate-500 mb-4">Admin-only view across all coaches</p>

      <MonthTabs availableMonths={availableMonths} activeMonth={activeMonth} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        <StatCard label="Total Assigned Leads" value={totalAssigned} />
        <StatCard label="Renewal Conversion Rate" value={`${conversionRate}%`} accent="blue" />
        <StatCard label="Verified Transactions" value={payments.length} accent="purple" />
        <StatCard label="Pending Verification" value={pendingVerificationCount} accent="amber" />
        <StatCard label="Pending Payments" value={pendingPayments} accent="amber" />
        <StatCard label="Lost Leads" value={lostLeads} accent="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <BreakdownStatCard label="Total Renewals" total={totalRenewals} accent="green" breakdown={renewedBreakdown} />
        <BreakdownStatCard
          label="Careplan Revenue"
          total={`₹${careplanRevenueTotal.toLocaleString('en-IN')}`}
          accent="purple"
          breakdown={careplanRevenueBreakdown}
          emptyText="No Careplan revenue this month"
        />
        <BreakdownStatCard
          label="Total Revenue"
          total={`₹${totalRevenue.toLocaleString('en-IN')}`}
          accent="green"
          breakdown={totalRevenueBreakdown}
          emptyText="No verified revenue this month"
        />
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

      {coachRows.some((r) => r.targetBreakdown.length > 0) && (() => {
        return (
          <div className="card overflow-x-auto mt-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Target achievement</h2>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Coach</th>
                  {targetTieredGroups.map((g) => (
                    <Fragment key={g.label}>
                      <th className="text-right">{g.label} — Achieved</th>
                      <th className="text-right">{g.label} — Tier Rate</th>
                      <th className="text-right">{g.label} — Incentive</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coachRows
                  .filter((r) => r.targetBreakdown.length > 0)
                  .map((r) => (
                    <tr key={r.coach}>
                      <td className="font-medium text-slate-700">{r.coach}</td>
                      {targetTieredGroups.map((g) => {
                        const tb = r.targetBreakdown.find((t) => t.category === g.label);
                        return (
                          <Fragment key={g.label}>
                            <td className="text-right">
                              {tb
                                ? `${
                                    tb.targetType === 'count' ? tb.achievedValue : `${tb.achievedValue.toFixed(1)}%`
                                  } (${tb.converted}/${tb.activeLeads})`
                                : '—'}
                            </td>
                            <td className="text-right">{tb ? `${tb.rate}%` : '—'}</td>
                            <td className="text-right font-medium text-brand-700">
                              {tb ? `₹${tb.incentive.toLocaleString('en-IN')}` : '—'}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-3">
              A coach with 0 Active leads this month shows &quot;—&quot; for a % ladder category —
              there&apos;s nothing to divide by. Active/Inactive comes from the sheet&apos;s own
              Column I, separate from the portal&apos;s workflow status.
            </p>
          </div>
        );
      })()}
    </div>
  );
}
