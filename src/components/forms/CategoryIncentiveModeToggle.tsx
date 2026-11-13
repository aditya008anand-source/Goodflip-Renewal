'use client';

import { useTransition } from 'react';
import { setCategoryIncentiveMode } from '@/app/(dashboard)/settings/actions';
import type { IncentiveMode } from '@/lib/types';

export default function CategoryIncentiveModeToggle({
  categoryId,
  mode,
}: {
  categoryId: string;
  mode: IncentiveMode;
}) {
  const [isPending, startTransition] = useTransition();
  const isTiered = mode === 'target_tiered';

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(() =>
          setCategoryIncentiveMode(categoryId, isTiered ? 'simple_percentage' : 'target_tiered')
        )
      }
      className={`text-xs font-medium ${isTiered ? 'text-slate-500' : 'text-purple-700'}`}
    >
      {isTiered ? 'Switch to simple %' : 'Switch to target-tiered'}
    </button>
  );
}
