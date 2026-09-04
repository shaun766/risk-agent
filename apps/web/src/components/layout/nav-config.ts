import {
  Banknote,
  Bot,
  LayoutDashboard,
  LineChart,
  ListTree,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  BarChart3,
  ScrollText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Permission } from '@flowmoney/shared-types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
}

export const CUSTOMER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, permission: Permission.VIEW_OWN_ACCOUNTS },
  { href: '/dashboard/transactions', label: 'Transactions', icon: Receipt, permission: Permission.VIEW_OWN_TRANSACTIONS },
  { href: '/dashboard/budget', label: 'Budget', icon: Wallet, permission: Permission.VIEW_OWN_BUDGET },
  { href: '/dashboard/purchases', label: 'Purchase Simulator', icon: ListTree, permission: Permission.REQUEST_PURCHASE_ANALYSIS },
  { href: '/dashboard/financial-health', label: 'Financial Health', icon: LineChart, permission: Permission.VIEW_OWN_FINANCIAL_HEALTH },
  { href: '/dashboard/investments', label: 'Investments', icon: TrendingUp, permission: Permission.VIEW_PORTFOLIO },
  { href: '/dashboard/reports', label: 'Reports', icon: ScrollText, permission: Permission.VIEW_OWN_REPORTS },
  { href: '/dashboard/agents', label: 'Ask FlowMoney AI', icon: Sparkles, permission: Permission.USE_AI_CHAT },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, permission: Permission.VIEW_AGGREGATE_ANALYTICS },
  { href: '/admin/users', label: 'Customers', icon: Users, permission: Permission.VIEW_CUSTOMERS },
  { href: '/admin/agents', label: 'AI Agents', icon: Bot, permission: Permission.VIEW_AGENTS },
  { href: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: Permission.VIEW_ROLES },
  { href: '/admin/products', label: 'Financial Products', icon: Banknote, permission: Permission.VIEW_FINANCIAL_PRODUCTS },
];

export const NON_STAFF_ROLES = new Set(['CUSTOMER']);

export function isStaff(roles: string[]): boolean {
  return roles.some((role) => !NON_STAFF_ROLES.has(role));
}
