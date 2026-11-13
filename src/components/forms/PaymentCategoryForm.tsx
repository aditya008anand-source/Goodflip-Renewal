'use client';

import { useRef, useState, useTransition } from 'react';
import { addPaymentCategory } from '@/app/(dashboard)/settings/actions';

// Lets an Admin add a new Product or Service category (e.g. a new CGM
// variant, or a new Careplan sub-team) right from the dashboard — no code
// change needed. New categories show up immediately in the payment form and
// the incentive rule form.
export default function PaymentCategoryForm() {
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState('product');
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addPaymentCategory(formData);
        formRef.current?.reset();
        setKind('product');
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="grid grid-cols-4 gap-2 items-end">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
        <input type="text" name="name" required className="input" placeholder="e.g. CGM Pro" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
        <select
          name="kind"
          className="input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="product">Product</option>
          <option value="service">Service</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Team sub-category {kind === 'product' && '(service only)'}
        </label>
        <input
          type="text"
          name="team_subcategory"
          className="input"
          disabled={kind === 'product'}
          placeholder="e.g. Field / Inside Sales"
        />
      </div>
      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? 'Adding…' : 'Add category'}
      </button>
      {error && <p className="text-xs text-red-600 col-span-4">{error}</p>}
    </form>
  );
}
