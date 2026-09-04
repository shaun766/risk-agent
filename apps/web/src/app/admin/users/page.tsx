'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Permission } from '@flowmoney/shared-types';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Modal } from '@/components/admin/modal';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import { formatCurrency, formatDateTime, initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Paginated } from '@/lib/types';

interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  status: string;
  city: string | null;
  occupation: string | null;
  declaredMonthlyIncome: number | null;
  roles: Array<{ key: string; name: string }>;
  counts: { bankAccounts: number; transactions: number; purchaseDecisions: number };
  lastLoginAt: string | null;
  createdAt: string;
}

interface AdminUserDetail {
  profile: Record<string, unknown>;
  accounts: unknown[];
  healthScores: unknown[];
  purchaseDecisions: unknown[];
}

const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'CLOSED'];

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  PENDING_VERIFICATION: 'warning',
  CLOSED: 'neutral',
};

export default function AdminUsersPage() {
  const { hasPermission } = useSession();
  const canManage = hasPermission(Permission.MANAGE_CUSTOMERS);
  const canViewFinancials = hasPermission(Permission.VIEW_CUSTOMER_FINANCIALS);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const users = useApi<Paginated<AdminUserRow>>(
    '/admin/users',
    { query: { page, pageSize: 20, search: search || undefined, status: status || undefined } },
    [page, search, status],
  );

  const detail = useApi<AdminUserDetail>(
    canViewFinancials && selectedUserId ? `/admin/users/${selectedUserId}` : null,
    undefined,
    [selectedUserId],
  );

  async function changeStatus(userId: string, nextStatus: string) {
    setUpdatingId(userId);
    setStatusError(null);
    try {
      await api.patch(`/admin/users/${userId}/status`, { status: nextStatus });
      users.refetch();
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Could not update status');
    } finally {
      setUpdatingId(null);
    }
  }

  const selectedUser = users.data?.items.find((u) => u.id === selectedUserId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search, filter, and manage customer accounts.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search name or email…"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="sm:w-56"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </div>

      {statusError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {statusError}
        </div>
      )}

      {users.loading ? (
        <div className="surface space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : users.error ? (
        <ErrorState message={users.error} retry={users.refetch} />
      ) : (users.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="No customers found" description="Try clearing your filters." />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium text-right">Accounts</th>
                <th className="px-4 py-3 font-medium text-right">Transactions</th>
                <th className="px-4 py-3 font-medium text-right">Decisions</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {users.data?.items.map((u) => (
                <tr
                  key={u.id}
                  className={cn('transition-colors', canViewFinancials && 'cursor-pointer hover:bg-accent/40')}
                  onClick={() => canViewFinancials && setSelectedUserId(u.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(u.fullName || u.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.fullName || '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        u.roles.map((r) => (
                          <Badge key={r.key} tone="neutral">
                            {r.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular">{u.counts.bankAccounts}</td>
                  <td className="px-4 py-3 text-right tabular">{u.counts.transactions}</td>
                  <td className="px-4 py-3 text-right tabular">{u.counts.purchaseDecisions}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {canManage ? (
                      <Select
                        value={u.status}
                        disabled={updatingId === u.id}
                        onChange={(e) => void changeStatus(u.id, e.target.value)}
                        className="h-8 w-auto py-1 text-xs"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone={STATUS_TONE[u.status] ?? 'neutral'}>{u.status.replace(/_/g, ' ')}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(u.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {users.data && users.data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {users.data.page} of {users.data.totalPages} · {users.data.total} customers
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= users.data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(selectedUserId)}
        onClose={() => setSelectedUserId(null)}
        title={selectedUser?.fullName || 'Customer detail'}
        description={selectedUser?.email}
      >
        {detail.loading ? (
          <div className="h-40 animate-pulse rounded-md bg-muted" />
        ) : detail.error ? (
          <ErrorState message={detail.error} retry={detail.refetch} />
        ) : detail.data ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <DetailStat label="City" value={selectedUser?.city ?? '—'} />
              <DetailStat label="Occupation" value={selectedUser?.occupation ?? '—'} />
              <DetailStat label="Declared income" value={formatCurrency(selectedUser?.declaredMonthlyIncome)} />
              <DetailStat label="Bank accounts" value={String(detail.data.accounts.length)} />
              <DetailStat label="Health scores sampled" value={String(detail.data.healthScores.length)} />
              <DetailStat label="Purchase decisions" value={String(detail.data.purchaseDecisions.length)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Full profile, account, and decision history for this customer is available via the API response — this
              panel summarizes the counts above.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You do not have permission to view this customer&apos;s financial detail.
          </p>
        )}
      </Modal>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
