'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Available to both Admin and Coach — what each person actually gets is
// limited server-side (see src/app/api/export-leads/route.ts), not here.
export default function ExportCsvButton({ activeMonth }: { activeMonth: string }) {
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);

  function handleClick() {
    setIsPending(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', activeMonth);
    const url = `/api/export-leads?${params.toString()}`;
    // A plain navigation (not fetch) so the browser's own download flow
    // handles the file — simplest way to trigger a download from a GET route.
    window.location.href = url;
    // There's no callback for "download started", so just clear the
    // spinner after a moment rather than leaving it stuck forever.
    setTimeout(() => setIsPending(false), 2000);
  }

  return (
    <button onClick={handleClick} disabled={isPending} className="btn-secondary shrink-0 whitespace-nowrap">
      {isPending ? 'Preparing…' : 'Export CSV'}
    </button>
  );
}
