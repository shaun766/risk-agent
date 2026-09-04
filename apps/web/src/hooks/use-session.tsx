'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { SessionUser } from '@/lib/types';

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.get<SessionUser>('/auth/me', { retryOnUnauthorized: true });
      setUser(me);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(err instanceof ApiError ? err.message : 'Could not load session');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {}, { retryOnUnauthorized: false });
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  const hasPermission = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  );
  const hasAnyPermission = useCallback(
    (...permissions: string[]) => permissions.some((p) => user?.permissions.includes(p)),
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, error, refresh, logout, hasPermission, hasAnyPermission }),
    [user, loading, error, refresh, logout, hasPermission, hasAnyPermission],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
