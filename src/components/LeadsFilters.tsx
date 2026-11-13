'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LEAD_STATUSES } from '@/lib/types';

export default function LeadsFilters({
  coaches,
  isAdmin,
}: {
  coaches: { id: string; display_name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    update('q', search);
  }

  function resetFilters() {
    setSearch('');
    startTransition(() => router.push(pathname));
  }

  const hasActiveFilters = Array.from(searchParams.keys()).some((k) => k !== 'month');

  return (
    <div className="card mb-4 space-y-3">
      <form onSubmit={submitSearch} className="flex gap-2 items-center">
        <input
          className="input"
          placeholder="Search by patient name, mobile number, or payment ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary shrink-0">
          Search
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-slate-500 font-medium shrink-0 underline"
          >
            Reset filters
          </button>
        )}
        {isPending && (
          <span className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-brand-700 animate-spin shrink-0" />
        )}
      </form>

      {/* key forces these uncontrolled selects to remount (and pick up their
          defaultValue again) whenever the URL's filters change — including a
          Reset, which otherwise would clear the URL but leave old selections
          visually stuck in the dropdowns. */}
      <div key={searchParams.toString()} className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {isAdmin && (
          <select
            className="input"
            defaultValue={searchParams.get('coach') ?? ''}
            onChange={(e) => update('coach', e.target.value)}
          >
            <option value="">All Coaches</option>
            <option value="unassigned">Unassigned</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        )}

        <select
          className="input"
          defaultValue={searchParams.get('status') ?? ''}
          onChange={(e) => update('status', e.target.value)}
        >
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className="input"
          defaultValue={searchParams.get('priority') ?? ''}
          onChange={(e) => update('priority', e.target.value)}
        >
          <option value="">All Priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <div className="flex gap-1 items-center col-span-2">
          <input
            type="date"
            className="input"
            title="Expiry from"
            defaultValue={searchParams.get('expiry_from') ?? ''}
            onChange={(e) => update('expiry_from', e.target.value)}
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            className="input"
            title="Expiry to"
            defaultValue={searchParams.get('expiry_to') ?? ''}
            onChange={(e) => update('expiry_to', e.target.value)}
          />
        </div>

        <div className="flex gap-1 items-center col-span-2">
          <input
            type="date"
            className="input"
            title="Follow-up from"
            defaultValue={searchParams.get('followup_from') ?? ''}
            onChange={(e) => update('followup_from', e.target.value)}
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            className="input"
            title="Follow-up to"
            defaultValue={searchParams.get('followup_to') ?? ''}
            onChange={(e) => update('followup_to', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
