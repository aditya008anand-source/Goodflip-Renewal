import { getCurrentUser } from '@/lib/auth';
import NavBar from '@/components/NavBar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-surface-bg">
      {/* Orders is now visible to everyone signed in — only editing the
          Order ID / tracking fields stays gated to Admin / Order Access. */}
      <NavBar role={user.role} name={user.name} showOrders={true} />
      <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
