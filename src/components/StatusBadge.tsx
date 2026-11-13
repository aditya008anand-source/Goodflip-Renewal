import clsx from 'clsx';
import type { LeadStatus, Priority } from '@/lib/types';

const STATUS_STYLES: Record<LeadStatus, string> = {
  New: 'bg-slate-100 text-slate-600',
  'Not Contacted': 'bg-slate-100 text-slate-600',
  Connected: 'bg-blue-50 text-blue-700',
  Interested: 'bg-purple-50 text-purple-700',
  'Follow-up Required': 'bg-amber-50 text-amber-700',
  'Payment Pending': 'bg-amber-50 text-amber-700',
  Renewed: 'bg-green-50 text-green-700',
  'Not Interested': 'bg-red-50 text-red-600',
  'Not Reachable': 'bg-red-50 text-red-600',
  Lost: 'bg-red-50 text-red-600',
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'
      )}
    >
      {status}
    </span>
  );
}

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'bg-red-50 text-red-600',
  Medium: 'bg-amber-50 text-amber-700',
  Low: 'bg-slate-100 text-slate-500',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        PRIORITY_STYLES[priority]
      )}
    >
      {priority}
    </span>
  );
}
