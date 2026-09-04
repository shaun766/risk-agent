'use client';

import { LogOut, Menu, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { isStaff, type NavItem } from '@/components/layout/nav-config';
import { FloatingChat } from '@/components/dashboard/floating-chat';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';

export function AppShell({
  nav,
  section,
  children,
}: {
  nav: NavItem[];
  section: 'dashboard' | 'admin';
  children: React.ReactNode;
}) {
  const { user, hasPermission, logout } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNav = nav.filter((item) => !item.permission || hasPermission(item.permission));
  const staff = user ? isStaff(user.roles) : false;

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-base font-semibold tracking-tight">FlowMoney AI</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleNav.map((item) => {
          const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        {staff && section === 'dashboard' && (
          <Link
            href="/admin/analytics"
            className="mt-4 flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Bank admin portal →
          </Link>
        )}
        {section === 'admin' && (
          <Link
            href="/dashboard"
            className="mt-4 flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            ← Back to my dashboard
          </Link>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-background shadow-xl">{sidebarContent}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-6">
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-accent md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="text-sm font-medium text-muted-foreground">
            {section === 'admin' ? 'Bank Administration' : 'Personal Dashboard'}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user && (
              <div className="flex items-center gap-2.5 rounded-full border border-border py-1 pl-1 pr-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {initials(user.fullName)}
                </div>
                <span className="hidden text-sm font-medium sm:inline">{user.fullName}</span>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>

      {mobileOpen && (
        <button
          className="fixed right-4 top-4 z-50 rounded-full bg-background p-2 shadow-lg md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {section === 'dashboard' && <FloatingChat />}
    </div>
  );
}
