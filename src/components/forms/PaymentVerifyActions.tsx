'use client';

import { useState, useTransition } from 'react';
import { verifyPayment } from '@/app/(dashboard)/leads/[id]/actions';

export default function PaymentVerifyActions({
  paymentId,
  leadId,
  paymentRef,
}: {
  paymentId: string;
  leadId: string;
  paymentRef: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refInput, setRefInput] = useState('');
  const [showRefInput, setShowRefInput] = useState(!paymentRef);

  function run(decision: 'verified' | 'rejected') {
    setError(null);

    if (decision === 'verified' && !paymentRef && !refInput.trim()) {
      setShowRefInput(true);
      setError('Enter the Payment ID before verifying.');
      return;
    }

    let note: string | undefined;
    if (decision === 'rejected') {
      note = window.prompt('Reason for rejecting this payment (optional):') ?? undefined;
    }
    startTransition(async () => {
      try {
        await verifyPayment(paymentId, leadId, decision, note, refInput.trim() || undefined);
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 mt-1">
      {showRefInput && !paymentRef && (
        <input
          type="text"
          value={refInput}
          onChange={(e) => setRefInput(e.target.value)}
          placeholder="Payment ID (required to verify)"
          className="input text-xs py-1"
        />
      )}
      <div className="flex items-center gap-2">
        <button
          disabled={isPending}
          onClick={() => run('verified')}
          className="text-xs text-green-700 font-medium"
        >
          {isPending ? 'Working…' : 'Verify'}
        </button>
        <button
          disabled={isPending}
          onClick={() => run('rejected')}
          className="text-xs text-red-600 font-medium"
        >
          Reject
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
