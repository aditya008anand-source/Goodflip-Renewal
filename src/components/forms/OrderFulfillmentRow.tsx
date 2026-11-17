'use client';

import { useState, useTransition } from 'react';
import { updateOrderFulfillment } from '@/app/(dashboard)/orders/actions';

export default function OrderFulfillmentRow({
  paymentId,
  initialOrderId,
  initialTrackingLink,
  canEdit,
}: {
  paymentId: string;
  initialOrderId: string | null;
  initialTrackingLink: string | null;
  canEdit: boolean;
}) {
  const [orderId, setOrderId] = useState(initialOrderId ?? '');
  const [trackingLink, setTrackingLink] = useState(initialTrackingLink ?? '');
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save(fields: { order_id?: string; tracking_link?: string }) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateOrderFulfillment(paymentId, fields);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  if (!canEdit) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>{orderId || '—'}</span>
        {trackingLink ? (
          <a href={trackingLink} target="_blank" rel="noreferrer" className="text-brand-700 underline">
            {trackingLink}
          </a>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="input w-36"
        placeholder="Order ID"
        value={orderId}
        onChange={(e) => setOrderId(e.target.value)}
        onBlur={() => save({ order_id: orderId })}
      />
      <input
        className="input w-48"
        placeholder="Tracking link"
        value={trackingLink}
        onChange={(e) => setTrackingLink(e.target.value)}
        onBlur={() => save({ tracking_link: trackingLink })}
      />
      {isPending && (
        <span className="h-3 w-3 rounded-full border-2 border-slate-200 border-t-brand-700 animate-spin shrink-0" />
      )}
      {saved && <span className="text-xs text-green-700">Saved</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
