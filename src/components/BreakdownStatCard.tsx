import clsx from 'clsx';

const ACCENTS = {
  slate: 'text-slate-800',
  blue: 'text-accent-blue',
  purple: 'text-accent-purple',
  green: 'text-accent-green',
  amber: 'text-amber-600',
  red: 'text-red-600',
} as const;

export interface BreakdownRow {
  label: string;
  value: string;
  /** Indents a row under the item above it — used for a sub-category under its group. */
  indent?: boolean;
  /** Visually separates this row from the ones above it (e.g. a trailing "Others" row). */
  emphasize?: boolean;
}

// A StatCard that also lists how its total splits across a few named parts
// — e.g. "Renewed: 12" broken into "Careplan: 8" / "Others: 4". Keeps the
// same big-number-at-top look as StatCard, with a short breakdown list
// underneath instead of a single sublabel line.
export default function BreakdownStatCard({
  label,
  total,
  accent = 'slate',
  breakdown,
  emptyText,
}: {
  label: string;
  total: string | number;
  accent?: keyof typeof ACCENTS;
  breakdown?: BreakdownRow[];
  emptyText?: string;
}) {
  const rows = breakdown ?? [];
  return (
    <div className="card">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={clsx('text-2xl font-semibold mt-1.5', ACCENTS[accent])}>{total}</p>

      {rows.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
          {rows.map((r, i) => (
            <div
              key={`${r.label}-${i}`}
              className={clsx(
                'flex items-center justify-between text-xs',
                r.emphasize ? 'font-medium text-slate-700' : 'text-slate-500'
              )}
            >
              <span className={clsx(r.indent && 'pl-3')}>{r.label}</span>
              <span className={clsx('font-medium', r.emphasize ? 'text-slate-800' : 'text-slate-600')}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        emptyText && <p className="text-xs text-slate-400 mt-2">{emptyText}</p>
      )}
    </div>
  );
}
