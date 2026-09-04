'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { BudgetStatus } from '@/lib/types';

interface Strategy {
  strategy: string;
  name: string;
  tagline: string;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
  investmentsPercent: number;
  debtPercent: number;
}

export default function BudgetPage() {
  const strategies = useApi<{ strategies: Strategy[] }>('/budget/strategies');
  const budget = useApi<BudgetStatus>('/budget/current');
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyStrategy(strategy: string) {
    setSaving(strategy);
    setError(null);
    try {
      await api.post('/budget', { strategy });
      budget.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update budget');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a strategy — the envelope split drives every downstream calculation.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(strategies.data?.strategies ?? []).map((s) => {
          const active = budget.data?.strategy === s.strategy;
          return (
            <button
              key={s.strategy}
              onClick={() => void applyStrategy(s.strategy)}
              disabled={saving !== null}
              className={cn(
                'surface surface-hover flex flex-col gap-3 p-4 text-left transition-all',
                active && 'border-primary ring-1 ring-primary',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{s.name}</p>
                {active && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground">{s.tagline}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 text-[10px]">
                <Badge tone="primary">{s.needsPercent}% needs</Badge>
                <Badge tone="neutral">{s.wantsPercent}% wants</Badge>
                <Badge tone="success">{s.savingsPercent}% savings</Badge>
                {s.investmentsPercent > 0 && <Badge tone="neutral">{s.investmentsPercent}% invest</Badge>}
                {s.debtPercent > 0 && <Badge tone="warning">{s.debtPercent}% debt</Badge>}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {budget.loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : !budget.data?.budgetId ? (
        <EmptyState title="No budget set for this month" description="Choose a strategy above to generate one." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="surface p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Category allocations</h2>
              <span className="text-xs text-muted-foreground">
                {budget.data.daysRemaining} days remaining · safe daily spend {formatCurrency(budget.data.safeDailySpend)}
              </span>
            </div>
            <div className="space-y-4">
              {budget.data.categories
                .filter((c) => c.allocated > 0 || c.spent > 0)
                .sort((a, b) => b.spent - a.spent)
                .map((c) => (
                  <div key={c.categoryKey}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{c.categoryLabel}</span>
                      <span className="tabular text-muted-foreground">
                        {formatCurrency(c.spent)} / {formatCurrency(c.allocated)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          c.utilisationPercent > 100 ? 'bg-destructive' : c.utilisationPercent > 85 ? 'bg-warning' : 'bg-primary',
                        )}
                        style={{ width: `${Math.min(100, c.utilisationPercent)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="surface p-5">
              <h2 className="mb-3 text-sm font-semibold">Plan vs actual</h2>
              <div className="space-y-2 text-sm">
                <Row label="Needs" plan={budget.data.planned.needs} actual={budget.data.actual.needs} />
                <Row label="Wants" plan={budget.data.planned.wants} actual={budget.data.actual.wants} />
                <Row label="Savings" plan={budget.data.planned.savings} actual={budget.data.actual.savings} />
                <Row label="Investments" plan={budget.data.planned.investments} actual={budget.data.actual.investments} />
                {budget.data.planned.debt > 0 && <Row label="Debt" plan={budget.data.planned.debt} actual={budget.data.actual.debt} />}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Adherence</span>
                <span className="font-semibold">{formatPercent(budget.data.adherencePercent)}</span>
              </div>
            </div>

            {budget.data.ruleViolations.length > 0 && (
              <div className="surface border-warning/30 p-5">
                <h2 className="mb-2 text-sm font-semibold text-warning">Rule violations</h2>
                <ul className="space-y-1.5 text-sm">
                  {budget.data.ruleViolations.map((v, i) => (
                    <li key={i}>
                      {v.label}: {formatCurrency(v.actual)} exceeds limit of {formatCurrency(v.limit)} by{' '}
                      {formatCurrency(v.exceededBy)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, plan, actual }: { label: string; plan: number; actual: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">
        {formatCurrency(actual)} <span className="text-muted-foreground">/ {formatCurrency(plan)}</span>
      </span>
    </div>
  );
}
