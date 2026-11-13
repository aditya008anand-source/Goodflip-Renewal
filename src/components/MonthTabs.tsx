'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import clsx from 'clsx';
import { formatMonthCohort } from '@/lib/months';

export default function MonthTabs({
  availableMonths,
  activeMonth,
}: {
  availableMonths: string[];
  activeMonth: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectMonth(month: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', month);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
      {availableMonths.map((month) => (
        <button
          key={month}
          onClick={() => selectMonth(month)}
          className={clsx(
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
            month === activeMonth
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          {formatMonthCohort(month)}
        </button>
      ))}
    </div>
  );
}
