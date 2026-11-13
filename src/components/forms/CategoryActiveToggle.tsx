'use client';

import { useTransition } from 'react';
import { setCategoryActive } from '@/app/(dashboard)/settings/actions';

export default function CategoryActiveToggle({
  categoryId,
  active,
}: {
  categoryId: string;
  active: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => setCategoryActive(categoryId, !active))}
      className={`text-xs font-medium ${active ? 'text-slate-500' : 'text-brand-700'}`}
    >
      {active ? 'Deactivate' : 'Activate'}
    </button>
  );
}
