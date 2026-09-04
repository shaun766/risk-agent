'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/hooks/use-api';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Paginated, TransactionRow } from '@/lib/types';

interface Category {
  key: string;
  label: string;
}

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryKey, setCategoryKey] = useState('');
  const [direction, setDirection] = useState('');

  const categories = useApi<{ categories: Category[] }>('/transactions/categories');
  const transactions = useApi<Paginated<TransactionRow>>(
    '/transactions',
    { query: { page, pageSize: 25, search: search || undefined, categoryKey: categoryKey || undefined, direction: direction || undefined } },
    [page, search, categoryKey, direction],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every posted transaction across your linked accounts.</p>
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
            placeholder="Search merchant or description…"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryKey}
          onChange={(e) => {
            setPage(1);
            setCategoryKey(e.target.value);
          }}
          className="sm:w-48"
        >
          <option value="">All categories</option>
          {(categories.data?.categories ?? []).map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          value={direction}
          onChange={(e) => {
            setPage(1);
            setDirection(e.target.value);
          }}
          className="sm:w-40"
        >
          <option value="">All</option>
          <option value="DEBIT">Debits</option>
          <option value="CREDIT">Credits</option>
        </Select>
      </div>

      <div className="surface p-2">
        {transactions.loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (transactions.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="No transactions found" description="Try clearing your filters." />
        ) : (
          <div className="divide-y divide-border/60">
            {transactions.data?.items.map((txn) => (
              <div key={txn.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    txn.direction === 'CREDIT' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {txn.direction === 'CREDIT' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{txn.merchant || txn.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {txn.category.label} · {formatDate(txn.occurredAt)}
                    {txn.isRecurring && ' · recurring'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`tabular text-sm font-semibold ${txn.direction === 'CREDIT' ? 'text-success' : ''}`}>
                    {txn.direction === 'CREDIT' ? '+' : '-'}
                    {formatCurrency(txn.amount)}
                  </p>
                  {txn.status !== 'POSTED' && (
                    <Badge tone="warning" className="mt-0.5 text-[10px]">
                      {txn.status}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {transactions.data && transactions.data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {transactions.data.page} of {transactions.data.totalPages} · {transactions.data.total} transactions
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= transactions.data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
