'use client';

import { useRef, useTransition } from 'react';
import { addInteraction } from '@/app/(dashboard)/leads/[id]/actions';
import { LEAD_STATUSES } from '@/lib/types';

export default function LogAttemptForm({ leadId }: { leadId: string }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await addInteraction(leadId, formData);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Call date &amp; time</label>
          <input
            type="datetime-local"
            name="call_datetime"
            className="input"
            defaultValue={new Date().toISOString().slice(0, 16)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Update lead status to</label>
          <select name="status" required className="input" defaultValue="">
            <option value="" disabled>
              Select status…
            </option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Comment / remarks</label>
        <textarea name="comment" rows={2} className="input" placeholder="What happened on this call…" />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Next follow-up date</label>
        <input type="date" name="next_followup_date" className="input" />
      </div>

      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? 'Saving…' : 'Log attempt'}
      </button>
    </form>
  );
}
