'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AuthGuard } from '@/components/layout/auth-guard';
import { CUSTOMER_NAV } from '@/components/layout/nav-config';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell nav={CUSTOMER_NAV} section="dashboard">
        {children}
      </AppShell>
    </AuthGuard>
  );
}
