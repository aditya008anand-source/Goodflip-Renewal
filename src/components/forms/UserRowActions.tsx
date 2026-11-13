'use client';

import { useState, useTransition } from 'react';
import {
  promoteToAdmin,
  demoteToCoach,
  removeUser,
  setVerifyAccess,
  setOrderAccess,
} from '@/app/(dashboard)/settings/actions';

export default function UserRowActions({
  userId,
  displayName,
  role,
  isSuperAdmin,
  canVerifyPayments,
  canManageOrders,
  canRemove,
  canGrantVerifyAccess,
  canGrantOrderAccess,
}: {
  userId: string;
  displayName: string;
  role: string;
  isSuperAdmin: boolean;
  canVerifyPayments: boolean;
  canManageOrders: boolean;
  canRemove: boolean;
  canGrantVerifyAccess: boolean;
  canGrantOrderAccess: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isSuperAdmin) {
    return <span className="text-xs text-slate-400">Protected — super admin</span>;
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {role === 'coach' ? (
        <button
          disabled={isPending}
          onClick={() => run(() => promoteToAdmin(userId))}
          className="text-xs text-brand-700 font-medium"
        >
          Make Admin
        </button>
      ) : (
        <button
          disabled={isPending}
          onClick={() => run(() => demoteToCoach(userId, displayName))}
          className="text-xs text-slate-500 font-medium"
        >
          Make Coach
        </button>
      )}
      {canGrantVerifyAccess && (
        <button
          disabled={isPending}
          onClick={() => run(() => setVerifyAccess(userId, !canVerifyPayments))}
          className="text-xs text-purple-700 font-medium"
        >
          {canVerifyPayments ? 'Revoke Verify Access' : 'Grant Verify Access'}
        </button>
      )}
      {canGrantOrderAccess && (
        <button
          disabled={isPending}
          onClick={() => run(() => setOrderAccess(userId, !canManageOrders))}
          className="text-xs text-blue-700 font-medium"
        >
          {canManageOrders ? 'Revoke Order Access' : 'Grant Order Access'}
        </button>
      )}
      {canRemove && (
        <button
          disabled={isPending}
          onClick={() => {
            if (confirm(`Remove ${displayName}? This cannot be undone.`)) {
              run(() => removeUser(userId));
            }
          }}
          className="text-xs text-red-600 font-medium"
        >
          Remove
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
