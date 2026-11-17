'use client';

import { useTransition } from 'react';
import { deleteIncentiveTargetTier } from '@/app/(dashboard)/settings/actions';

export default function DeleteTierButton({ tierId }: { tierId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm('Delete this tier? This cannot be undone.')) return;
    startTransition(async () => {
      await deleteIncentiveTargetTier(tierId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
