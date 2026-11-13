'use client';

import { useRef, useTransition } from 'react';
import { recordPayment } from '@/app/(dashboard)/leads/[id]/actions';
import type { PaymentCategory } from '@/lib/types';

export default function PaymentForm({
  leadId,
  categories,
}: {
  leadId: string;
  categories: PaymentCategory[];
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await recordPayment(leadId, formData);
      formRef.current?.reset();
    });
  }

  const products = categories.filter((c) => c.kind === 'product');
  const services = categories.filter((c) => c.kind === 'service');

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Product / Service</label>
          <select name="category_id" required className="input" defaultValue="">
            <option value="" disabled>— Select —</option>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Amount (₹)</label>
          <input type="number" step="0.01" name="amount" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment date</label>
          <input type="date" name="payment_date" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment / Transaction ID</label>
          <input type="text" name="payment_ref" className="input" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Payment screenshot</label>
        <input type="file" name="screenshot" accept="image/*" required className="input" />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
        <textarea name="remarks" rows={2} required className="input" />
      </div>

      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? 'Saving…' : 'Record payment'}
      </button>
    </form>
  );
}
