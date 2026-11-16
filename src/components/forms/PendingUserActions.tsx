'use client';

import { useTransition } from 'react';
import { approveUser, rejectUser } from '@/app/(dashboard)/settings/actions';

export default function PendingUserActions({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();

  function approve() {
    startTransition(() => approveUser(userId));
  }

  function reject() {
    if (!confirm('Reject this request? This deletes the account — they can submit a new request from /join if needed.')) return;
    startTransition(() => rejectUser(userId));
  }

  return (
    <div className="flex gap-2">
      <button type="button" disabled={isPending} onClick={approve} className="btn-primary text-xs">
        Approve
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={reject}
        className="text-xs text-red-600 underline"
      >
        Reject
      </button>
    </div>
  );
}
