'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import clsx from 'clsx';
import type { UserRole } from '@/lib/types';

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview', adminOnly: false, ordersOnly: false },
  { href: '/leads', label: 'Renewal Leads', adminOnly: false, ordersOnly: false },
  { href: '/revenue', label: 'Revenue & Incentives', adminOnly: true, ordersOnly: false },
  { href: '/orders', label: 'Orders', adminOnly: false, ordersOnly: true },
  { href: '/settings', label: 'Settings', adminOnly: true, ordersOnly: false },
];

export default function NavBar({
  role,
  name,
  showOrders,
}: {
  role: UserRole;
  name: string;
  showOrders: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="bg-brand-700 text-white">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-white/15 flex items-center justify-center font-bold text-sm">
              M
            </div>
            <div className="leading-tight">
              <p className="font-semibold text-sm">MySaathi</p>
              <p className="text-[10px] uppercase tracking-wide text-white/60">Renewal Portal</p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.filter(
              (item) => (!item.adminOnly || role === 'admin') && (!item.ordersOnly || showOrders)
            ).map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    active ? 'bg-white/15 text-white' : 'text-white/75 hover:text-white hover:bg-white/10'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-white/80">{name}</span>
          <button
            onClick={handleLogout}
            className="text-sm bg-white/10 hover:bg-white/20 rounded-md px-3 py-1.5 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
