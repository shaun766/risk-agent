'use client';

import { Permission } from '@flowmoney/shared-types';
import { AppShell } from '@/components/layout/app-shell';
import { AuthGuard } from '@/components/layout/auth-guard';
import { ADMIN_NAV } from '@/components/layout/nav-config';

const STAFF_PERMISSIONS = [
  Permission.VIEW_CUSTOMERS,
  Permission.VIEW_AGENTS,
  Permission.VIEW_ROLES,
  Permission.VIEW_FINANCIAL_PRODUCTS,
  Permission.VIEW_AGGREGATE_ANALYTICS,
  Permission.VIEW_SYSTEM_ANALYTICS,
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAnyPermission={STAFF_PERMISSIONS}>
      <AppShell nav={ADMIN_NAV} section="admin">
        {children}
      </AppShell>
    </AuthGuard>
  );
}
