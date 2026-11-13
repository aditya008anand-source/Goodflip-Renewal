'use client';

import { useTransition } from 'react';
import { reassignCoach } from '@/app/(dashboard)/leads/[id]/actions';

export default function ReassignCoachSelect({
  leadId,
  coaches,
  currentCoachId,
}: {
  leadId: string;
  coaches: { id: string; display_name: string }[];
  currentCoachId: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      className="input !py-1.5 text-sm"
      defaultValue={currentCoachId ?? ''}
      disabled={isPending}
      onChange={(e) => startTransition(() => reassignCoach(leadId, e.target.value || null))}
    >
      <option value="">Unassigned</option>
      {coaches.map((c) => (
        <option key={c.id} value={c.id}>
          {c.display_name}
        </option>
      ))}
    </select>
  );
}
