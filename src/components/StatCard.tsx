import clsx from 'clsx';

const ACCENTS = {
  slate: 'text-slate-800',
  blue: 'text-accent-blue',
  purple: 'text-accent-purple',
  green: 'text-accent-green',
  amber: 'text-amber-600',
  red: 'text-red-600',
} as const;

export default function StatCard({
  label,
  value,
  accent = 'slate',
  sublabel,
}: {
  label: string;
  value: string | number;
  accent?: keyof typeof ACCENTS;
  sublabel?: string;
}) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={clsx('text-2xl font-semibold mt-1.5', ACCENTS[accent])}>{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}
