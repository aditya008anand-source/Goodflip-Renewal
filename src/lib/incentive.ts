import type { IncentiveSetting, IncentiveTargetTier } from '@/lib/types';

// Picks the incentive rule that applies to a given category, for a given
// month_cohort (e.g. '2026-11') — NOT the payment's own date. Everything on
// the Revenue page is already scoped to one month tab, so the rule lookup
// is scoped the same way: a rule set for an exact month only ever affects
// that month, however many times it's changed afterwards.
//
// Priority: exact category + exact month > exact category + default (no
// month set) > default category (no category set) + exact month > overall
// default (no category, no month). Within any of these, the most recently
// added row (by effective_from) wins, so correcting a month's rule before
// it's "finalised" is just adding another row for the same month.
export function findApplicableRule(
  rules: IncentiveSetting[],
  categoryId: string | null,
  month: string
): IncentiveSetting | null {
  const pick = (candidates: IncentiveSetting[]) =>
    candidates.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;

  const categoryExactMonth = pick(rules.filter((r) => r.category_id === categoryId && r.month_cohort === month));
  if (categoryExactMonth) return categoryExactMonth;

  const categoryDefault = pick(rules.filter((r) => r.category_id === categoryId && r.month_cohort === null));
  if (categoryDefault) return categoryDefault;

  const overallExactMonth = pick(rules.filter((r) => r.category_id === null && r.month_cohort === month));
  if (overallExactMonth) return overallExactMonth;

  return pick(rules.filter((r) => r.category_id === null && r.month_cohort === null));
}

export function calculateIncentive(
  rule: IncentiveSetting | null,
  revenue: number
): { amount: number; explanation: string } {
  if (!rule) return { amount: 0, explanation: 'No incentive rule configured.' };

  if (rule.type === 'fixed') {
    return {
      amount: rule.value,
      explanation: `Fixed ₹${rule.value.toLocaleString('en-IN')} per renewal`,
    };
  }

  const amount = Math.round((revenue * rule.value) / 100);
  return {
    amount,
    explanation: `${rule.value}% of ₹${revenue.toLocaleString('en-IN')} revenue`,
  };
}

// Same month-first priority as findApplicableRule, but returns the WHOLE
// matching ladder (every tier row for that category+month) rather than one
// row — a tier ladder is several rows (one per rung) that all apply
// together. Falls back to the default ladder (month_cohort = null) if this
// category has no tiers set for this exact month yet.
export function findApplicableTiers(
  tiers: IncentiveTargetTier[],
  categoryId: string,
  month: string
): IncentiveTargetTier[] {
  const exactMonth = tiers.filter((t) => t.category_id === categoryId && t.month_cohort === month);
  if (exactMonth.length > 0) return exactMonth;
  return tiers.filter((t) => t.category_id === categoryId && t.month_cohort === null);
}

// Picks the highest tier whose min_value the coach has reached, e.g. 0 up to
// 19 achieved -> 0%, 20-29 -> 10%, 30-39 -> 15%, 40+ -> 20%. Returns 0% if
// nothing matches (or no tiers are configured at all) — same "no rule, no
// incentive" fallback as calculateIncentive. `achievedValue` is either a %
// or a raw count, matching whatever target_type the ladder's rows use.
export function findTargetTierRate(tiers: IncentiveTargetTier[], achievedValue: number): number {
  const candidates = tiers
    .filter((t) => t.min_value <= achievedValue)
    .sort((a, b) => b.min_value - a.min_value);
  return candidates[0]?.incentive_percent ?? 0;
}

export function calculateTargetTierIncentive(
  tiers: IncentiveTargetTier[],
  achievedValue: number,
  revenue: number
): { amount: number; rate: number; explanation: string } {
  const rate = findTargetTierRate(tiers, achievedValue);
  const amount = Math.round((revenue * rate) / 100);
  const targetType = tiers[0]?.target_type ?? 'percentage';
  const achievedLabel = targetType === 'count' ? `${achievedValue} converted` : `${achievedValue.toFixed(1)}% target achieved`;
  return {
    amount,
    rate,
    explanation:
      rate > 0
        ? `${achievedLabel} → ${rate}% of ₹${revenue.toLocaleString('en-IN')} revenue`
        : `${achievedLabel} — below the lowest tier, no incentive`,
  };
}
