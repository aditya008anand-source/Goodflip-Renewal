import { getCurrentUser } from '@/lib/auth';
import NavBar from '@/components/NavBar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-surface-bg">
      <NavBar
        role={user.role}
        name={user.name}
        showOrders={user.role === 'admin' || user.canManageOrders}
      />
      <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
