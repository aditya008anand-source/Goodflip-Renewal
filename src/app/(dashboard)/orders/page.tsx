import { getCurrentUser } from '@/lib/auth';
import { createServiceRoleSupabase } from '@/lib/supabase/server';
import { format } from 'date-fns';
import OrderFulfillmentRow from '@/components/forms/OrderFulfillmentRow';

// Only verified Product (CGM/BCA/Nutra — not Services) purchases show up
// here: nothing to fulfill until a payment is actually confirmed on the
// Revenue flow, and Services (Careplans) don't ship anything.
//
// Viewing this page is open to every signed-in user (coach or admin) — no
// "Order Access" grant needed just to see it, hence the service-role client
// below (bypasses RLS, which would otherwise scope a coach to only their
// own patients). Editing the Order ID / tracking fields stays restricted to
// Admin / whoever's been granted Order Access — see `canEdit` below and
// requireOrderAccess() in actions.ts, which still enforces this at the
// database level too.
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await getCurrentUser();
  const canEdit = user.role === 'admin' || user.canManageOrders;
  const supabase = createServiceRoleSupabase();

  let query = supabase
    .from('payments')
    .select('*, leads(patient_name, mobile_number), payment_categories(name, kind)')
    .eq('verification_status', 'verified')
    .eq('payment_categories.kind', 'product')
    .order('verified_at', { ascending: false });

  const { data: payments, error } = await query;

  // The join filter above (`payment_categories.kind`) only narrows which
  // category row is attached, not which payments come back — drop any row
  // whose category didn't match (i.e. it's a Service, not a Product).
  const productPayments = (payments ?? []).filter((p: any) => p.payment_categories?.kind === 'product');

  const q = searchParams.q?.toLowerCase();
  const filtered = q
    ? productPayments.filter(
        (p: any) =>
          p.leads?.patient_name?.toLowerCase().includes(q) ||
          p.leads?.mobile_number?.includes(q) ||
          p.order_id?.toLowerCase().includes(q)
      )
    : productPayments;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Orders</h1>
      <p className="text-sm text-slate-500 mb-4">
        Verified Product purchases.
        {canEdit
          ? ' Add the Order ID / tracking link below.'
          : ' Order ID / tracking link are added by Admin or Order Access.'}
      </p>

      <form className="card mb-4 flex gap-2">
        <input
          name="q"
          className="input"
          placeholder="Search by patient name, mobile number, or Order ID…"
          defaultValue={searchParams.q ?? ''}
        />
        <button type="submit" className="btn-secondary shrink-0">
          Search
        </button>
      </form>

      <div className="card overflow-x-auto">
        {error && <p className="text-sm text-red-600 mb-2">{error.message}</p>}
        <table className="table-base">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Mobile</th>
              <th>Product</th>
              <th>Amount</th>
              <th>Verified on</th>
              <th>Order ID / Tracking</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => (
              <tr key={p.id}>
                <td className="font-medium text-slate-800">{p.leads?.patient_name ?? '—'}</td>
                <td>{p.leads?.mobile_number ?? '—'}</td>
                <td className="text-slate-600">{p.payment_categories?.name ?? '—'}</td>
                <td>₹{Number(p.amount ?? 0).toLocaleString('en-IN')}</td>
                <td>{p.verified_at ? format(new Date(p.verified_at), 'dd MMM yyyy') : '—'}</td>
                <td>
                  <OrderFulfillmentRow
                    paymentId={p.id}
                    initialOrderId={p.order_id}
                    initialTrackingLink={p.tracking_link}
                    canEdit={canEdit}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center">
            No verified Product purchases to fulfill yet.
          </p>
        )}
      </div>
    </div>
  );
}
