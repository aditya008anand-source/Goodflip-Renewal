'use client';

import { useRef, useTransition } from 'react';
import { addIncentiveRule } from '@/app/(dashboard)/settings/actions';
import type { PaymentCategory } from '@/lib/types';

export default function IncentiveRuleForm({
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
      await addIncentiveRule(formData);
      formRef.current?.reset();
    });
  }

  const products = categories.filter((c) => c.kind === 'product');
  const services = categories.filter((c) => c.kind === 'service');

  return (
    <form ref={formRef} action={handleSubmit} className="grid grid-cols-6 gap-2 items-end">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Month (blank = default for all)</label>
        <select name="month_cohort" className="input" defaultValue="">
          <option value="">— Default (every month) —</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Category (blank = default for all)</label>
        <select name="category_id" className="input" defaultValue="">
          <option value="">— Default (all) —</option>
          {products.length > 0 && (
            <optgroup label="Product">
              {products.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          )}
          {services.length > 0 && (
            <optgroup label="Service">
              {services.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
        <select name="type" className="input" defaultValue="percentage">
          <option value="percentage">% of revenue</option>
          <option value="fixed">Fixed per renewal</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
        <input type="number" step="0.01" name="value" required className="input" />
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
        {isPending ? 'Saving…' : 'Add rule'}
      </button>
    </form>
  );
}
