'use server';

import { revalidatePath } from 'next/cache';
import { requireOrderAccess } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';

// Supply-team fulfillment fields on a payment — Order ID / tracking link
// and whether the plan has been assigned. Access is gated by
// requireOrderAccess() here AND by the payments_order_update RLS policy
// (migration-4.sql), same pattern as payment verification.
export async function updateOrderFulfillment(
  paymentId: string,
  fields: { order_id?: string; tracking_link?: string; plan_assigned?: boolean }
) {
  const user = await requireOrderAccess();
  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('payments')
    .update({
      ...fields,
      order_updated_by: user.id,
      order_updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId);
  if (error) throw new Error(error.message);

  revalidatePath('/orders');
}
