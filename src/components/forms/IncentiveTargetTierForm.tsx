'use client';

import { useRef, useTransition } from 'react';
import { addIncentiveTargetTier } from '@/app/(dashboard)/settings/actions';
import type { PaymentCategory } from '@/lib/types';

// Only categories already switched to "target-tiered" mode show up here —
// the simple %/fixed categories keep using the existing Incentive
// configuration form above.
export default function IncentiveTargetTierForm({
  categories,
  availableMonths,
}: {
  categories: PaymentCategory[];
  availableMonths: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await addIncentiveTargetTier(formData);
      formRef.current?.reset();
    });
  }

  if (categories.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No category is set to &quot;target-tiered&quot; yet — switch one above (e.g. Careplan) to
        add tiers for it here.
      </p>
    );
  }

  return (
    <form ref={formRef} action={handleSubmit} className="grid grid-cols-7 gap-2 items-end">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Month (blank = default)</label>
        <select name="month_cohort" className="input" defaultValue="">
          <option value="">— Default (every month) —</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
        <select name="category_id" required className="input" defaultValue="">
          <option value="" disabled>— Select —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Target type</label>
        <select name="target_type" className="input" defaultValue="percentage">
          <option value="percentage">% of Active leads</option>
          <option value="count">Count (number of payments)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Minimum target</label>
        <input type="number" step="0.01" name="min_value" required className="input" placeholder="e.g. 20" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Incentive %</label>
        <input type="number" step="0.01" name="incentive_percent" required className="input" placeholder="e.g. 10" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Effective from</label>
        <input
          type="date"
          name="effective_from"
          className="input"
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
      </div>
      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? 'Saving…' : 'Add tier'}
      </button>
    </form>
  );
}
