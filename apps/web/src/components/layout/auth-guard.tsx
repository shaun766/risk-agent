'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/hooks/use-session';

export function AuthGuard({
  children,
  requireAnyPermission,
}: {
  children: React.ReactNode;
  requireAnyPermission?: string[];
}) {
  const { user, loading, hasAnyPermission } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  if (requireAnyPermission && !hasAnyPermission(...requireAnyPermission)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-semibold">You don&apos;t have access to this area</p>
        <p className="text-sm text-muted-foreground">
          Ask a bank administrator to grant you the required permission.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
