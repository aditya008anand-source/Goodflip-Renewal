'use client';

import { useState, useTransition } from 'react';
import { triggerSheetSync } from '@/app/(dashboard)/settings/actions';

export default function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn-primary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await triggerSheetSync();
            } catch (e: any) {
              setError(e.message);
            }
          })
        }
      >
        {isPending ? 'Syncing…' : 'Sync now'}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
