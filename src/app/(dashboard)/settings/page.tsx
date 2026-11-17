import { requireAdmin } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { format } from 'date-fns';
import InviteCoachForm from '@/components/forms/InviteCoachForm';
import IncentiveRuleForm from '@/components/forms/IncentiveRuleForm';
import PaymentCategoryForm from '@/components/forms/PaymentCategoryForm';
import CategoryActiveToggle from '@/components/forms/CategoryActiveToggle';
import CategoryIncentiveModeToggle from '@/components/forms/CategoryIncentiveModeToggle';
import IncentiveTargetTierForm from '@/components/forms/IncentiveTargetTierForm';
import UserRowActions from '@/components/forms/UserRowActions';
import PendingUserActions from '@/components/forms/PendingUserActions';
import SyncButton from '@/components/SyncButton';
import { LEAD_STATUSES } from '@/lib/types';

export default async function SettingsPage() {
  const me = await requireAdmin();
  const supabase = createServerSupabase();

  const { data: allUsersRaw } = await supabase
    .from('users')
    .select('id, name, email, role, is_super_admin, can_verify_payments, can_manage_orders, approved')
    .order('role')
    .order('name');

  const allUsers = (allUsersRaw ?? []).filter((u) => u.approved !== false);
  const pendingUsers = (allUsersRaw ?? []).filter((u) => u.approved === false);

  const { data: categories } = await supabase
    .from('payment_categories')
    .select('*')
    .order('kind')
    .order('name');

  const { data: incentiveRules } = await supabase
    .from('incentive_settings')
    .select('*, payment_categories(name)')
    .order('effective_from', { ascending: false });

  const { data: targetTiers } = await supabase
    .from('incentive_target_tiers')
    .select('*, payment_categories(name)')
    .order('min_value', { ascending: true });

  const targetTieredCategories = (categories ?? []).filter((c) => c.incentive_mode === 'target_tiered');

  const { data: monthRows } = await supabase.from('leads').select('month_cohort');
  const availableMonths = Array.from(new Set((monthRows ?? []).map((r) => r.month_cohort))).sort().reverse();

  const { data: lastSync } = await supabase
    .from('sync_logs')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Google Sheets sync</h2>
        <p className="text-xs text-slate-500 mb-3">
          Pulls new/changed rows from the published November sheet. Existing comments, payment
          records and call history are never overwritten — only master fields (name, programme,
          expiry date, etc.) are refreshed for leads that already exist. A lead that disappears
          from the sheet is removed from every list in the portal, but its history and any
          verified payment are kept (never deleted) — it comes back automatically if it
          reappears in a later sync.
        </p>
        <div className="flex items-center gap-4">
          <SyncButton />
          <p className="text-xs text-slate-500">
            {lastSync
              ? `Last sync: ${format(new Date(lastSync.run_at), 'dd MMM yyyy, h:mm a')} — ${lastSync.status} (${lastSync.rows_added} added, ${lastSync.rows_updated} updated, ${lastSync.rows_flagged} flagged, ${lastSync.rows_deactivated ?? 0} removed from sheet)`
              : 'No sync has run yet.'}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Coaches &amp; Admins</h2>
        <p className="text-xs text-slate-500 mb-3">
          Inviting someone creates their login and gives you a one-time link to set their password —
          copy it and send it to them yourself (WhatsApp, email, etc.); no email is sent
          automatically. Choose their access (Coach/Admin) now, or change it later below — a Coach
          only sees their own leads, an Admin sees everything. &quot;Verify Access&quot; and
          &quot;Order Access&quot; are both separate from Admin — only people you grant them to
          (only you can grant either) can verify/reject a payment, or fill in Order ID/tracking and
          Plan Assigned on the Orders page.
        </p>
        <InviteCoachForm />

        <table className="table-base mt-4">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Access</th>
              <th>Verify Access</th>
              <th>Order Access</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(allUsers ?? []).map((u: any) => (
              <tr key={u.id}>
                <td className="font-medium text-slate-700">{u.name}</td>
                <td className="text-slate-500">{u.email}</td>
                <td>{u.is_super_admin ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Coach'}</td>
                <td>{u.is_super_admin || u.can_verify_payments ? 'Yes' : '—'}</td>
                <td>{u.is_super_admin || u.can_manage_orders ? 'Yes' : '—'}</td>
                <td>
                  <UserRowActions
                    userId={u.id}
                    displayName={u.name}
                    role={u.role}
                    isSuperAdmin={u.is_super_admin}
                    canVerifyPayments={u.can_verify_payments}
                    canManageOrders={u.can_manage_orders}
                    canRemove={me.isSuperAdmin}
                    canGrantVerifyAccess={me.isSuperAdmin}
                    canGrantOrderAccess={me.isSuperAdmin}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Self-signup &amp; approvals</h2>
        <p className="text-xs text-slate-500 mb-3">
          Send this one link to everyone at once (WhatsApp, etc.) instead of generating a separate
          invite link per person — anyone with a @tatvacare.in email can create their own login
          there, but they can&apos;t sign in until you approve them below.
        </p>
        <p className="text-xs font-mono bg-slate-50 border border-slate-200 rounded px-3 py-2 mb-4 break-all">
          {process.env.NEXT_PUBLIC_SITE_URL ?? ''}/join
        </p>

        {pendingUsers.length === 0 ? (
          <p className="text-xs text-slate-400">No pending requests.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((u: any) => (
                <tr key={u.id}>
                  <td className="font-medium text-slate-700">{u.name}</td>
                  <td className="text-slate-500">{u.email}</td>
                  <td>
                    <PendingUserActions userId={u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Products &amp; Services</h2>
        <p className="text-xs text-slate-500 mb-3">
          What a coach can select when recording a payment. Add a new Product (e.g. a CGM variant)
          or Service (e.g. a new Careplan sub-team) any time — no code change needed.
        </p>
        <PaymentCategoryForm />

        <table className="table-base mt-4">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Team sub-category</th>
              <th>Status</th>
              <th>Incentive mode</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(categories ?? []).map((c) => (
              <tr key={c.id}>
                <td className="font-medium text-slate-700">{c.name}</td>
                <td className="capitalize">{c.kind}</td>
                <td className="text-slate-500">{c.team_subcategory ?? '—'}</td>
                <td>{c.active ? 'Active' : 'Inactive'}</td>
                <td>{c.incentive_mode === 'target_tiered' ? 'Target-tiered' : 'Simple %'}</td>
                <td>
                  <CategoryActiveToggle categoryId={c.id} active={c.active} />
                </td>
                <td>
                  <CategoryIncentiveModeToggle categoryId={c.id} mode={c.incentive_mode} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Incentive configuration</h2>
        <p className="text-xs text-slate-500 mb-3">
          Leave category blank to set the default rule applied when no category-specific rule
          matches. New rules apply from their effective date onward — past months are unaffected.
          This only applies to categories left on &quot;Simple %&quot; above.
        </p>
        <IncentiveRuleForm
          categories={(categories ?? []).filter((c) => c.incentive_mode === 'simple_percentage')}
          availableMonths={availableMonths}
        />

        <table className="table-base mt-4">
          <thead>
            <tr>
              <th>Month</th>
              <th>Category</th>
              <th>Type</th>
              <th>Value</th>
              <th>Effective from</th>
            </tr>
          </thead>
          <tbody>
            {(incentiveRules ?? []).map((r: any) => (
              <tr key={r.id}>
                <td>{r.month_cohort ?? <span className="text-slate-400">Default (every month)</span>}</td>
                <td>{r.payment_categories?.name ?? <span className="text-slate-400">Default (all)</span>}</td>
                <td>{r.type === 'percentage' ? '% of revenue' : 'Fixed per renewal'}</td>
                <td>{r.type === 'percentage' ? `${r.value}%` : `₹${r.value}`}</td>
                <td>{format(new Date(r.effective_from), 'dd MMM yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Target-based incentive (tiers)</h2>
        <p className="text-xs text-slate-500 mb-3">
          For a category switched to &quot;Target-tiered&quot; above (e.g. Careplan) — pick either
          &quot;% of Active leads&quot; (each coach&apos;s verified payments in this category ÷ their
          own &quot;Active&quot; leads from the sheet&apos;s Column I, this month) or a flat
          &quot;Count&quot; of payments. Whichever tier they reach sets the incentive rate on their
          revenue in this category. Setting a Month locks that ladder to only that month — leave it
          blank for a default ladder used by any month without its own. A coach with 0 Active leads
          this month is left out of the Revenue page&apos;s % calculation entirely rather than shown
          at 0%.
        </p>
        <IncentiveTargetTierForm categories={targetTieredCategories} availableMonths={availableMonths} />

        <table className="table-base mt-4">
          <thead>
            <tr>
              <th>Month</th>
              <th>Category</th>
              <th>Target type</th>
              <th>Minimum target</th>
              <th>Incentive %</th>
              <th>Effective from</th>
            </tr>
          </thead>
          <tbody>
            {(targetTiers ?? []).map((t: any) => (
              <tr key={t.id}>
                <td>{t.month_cohort ?? <span className="text-slate-400">Default (every month)</span>}</td>
                <td>{t.payment_categories?.name ?? '—'}</td>
                <td>{t.target_type === 'count' ? 'Count' : '% of Active leads'}</td>
                <td>{t.target_type === 'count' ? t.min_value : `${t.min_value}%`}</td>
                <td>{t.incentive_percent}%</td>
                <td>{format(new Date(t.effective_from), 'dd MMM yyyy')}</td>
              </tr>
            ))}
            {(targetTiers ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-400 py-4">
                  No tiers configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Lead statuses</h2>
        <p className="text-xs text-slate-500 mb-3">
          The portal currently supports this fixed set of statuses. Changing this list requires a
          small code change (it&apos;s enforced by a database constraint so a coach can never save
          an inconsistent value) — tell your developer which statuses to add, rename or remove.
        </p>
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map((s) => (
            <span key={s} className="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
