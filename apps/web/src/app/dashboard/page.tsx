'use client';

import { AlertTriangle, PiggyBank, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { ScoreRing } from '@/components/ui/score-ring';
import { CardSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { CashFlowChart } from '@/components/dashboard/cash-flow-chart';
import { CategoryChart } from '@/components/dashboard/category-chart';
import { AskAiCard } from '@/components/dashboard/ask-ai-card';
import { PurchaseHistoryTable } from '@/components/dashboard/purchase-history-table';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { formatCurrency, formatPercent, greeting, RISK_STYLES } from '@/lib/format';
import type { FinancialHealth, FinancialSnapshot, Paginated } from '@/lib/types';

interface PurchaseRow {
  id: string;
  description: string | null;
  merchant: string | null;
  categoryKey: string;
  price: number;
  verdict: string;
  score: number;
  createdAt: string;
}

export default function DashboardOverviewPage() {
  const { user } = useSession();
  const snapshot = useApi<FinancialSnapshot>('/financial-snapshot');
  const health = useApi<FinancialHealth>('/financial-health');
  const purchases = useApi<Paginated<PurchaseRow>>('/purchase/history', { query: { pageSize: 6 } });

  const firstName = user?.fullName.split(' ')[0] ?? '';
  const riskStyle = health.data ? RISK_STYLES[health.data.riskLevel] : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="mesh surface flex flex-col justify-between gap-6 p-6 md:flex-row md:items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            {greeting()}, {firstName}.
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            Here&apos;s where your money stands today.
          </h1>
          {snapshot.data && (
            <p className="mt-2 text-sm text-muted-foreground">
              {snapshot.data.period.daysRemaining} days left this cycle · Runway of{' '}
              {snapshot.data.runwayDays >= 999 ? '30+' : Math.round(snapshot.data.runwayDays)} days at your current burn
              rate
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {health.loading ? (
            <CardSkeleton />
          ) : health.data ? (
            <div className="flex items-center gap-4">
              <ScoreRing score={health.data.score} label="Health" />
              <div>
                <p className="text-sm font-medium">Financial Health</p>
                {riskStyle && (
                  <span
                    className={`text-xs font-medium ${
                      riskStyle.tone === 'success'
                        ? 'text-success'
                        : riskStyle.tone === 'warning'
                          ? 'text-warning'
                          : 'text-destructive'
                    }`}
                  >
                    {riskStyle.label}
                  </span>
                )}
                <Link href="/dashboard/financial-health" className="mt-1 block text-xs text-primary hover:underline">
                  View breakdown →
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {snapshot.error && <ErrorState message={snapshot.error} retry={snapshot.refetch} />}

      {snapshot.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : snapshot.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Available balance"
            value={formatCurrency(snapshot.data.availableBalance)}
            hint={`Net worth ${formatCurrency(snapshot.data.netWorth)}`}
            icon={Wallet}
          />
          <StatCard
            label="Spent this month"
            value={formatCurrency(snapshot.data.totalSpentThisPeriod)}
            hint={`Projected month-end ${formatCurrency(snapshot.data.projectedMonthEndSpend)}`}
            icon={AlertTriangle}
            tone={snapshot.data.budgetAdherencePercent < 70 ? 'warning' : 'default'}
          />
          <StatCard
            label="Savings progress"
            value={formatCurrency(snapshot.data.savingsProgress)}
            hint={`Target ${formatCurrency(snapshot.data.savingsTarget)} · ${formatPercent(snapshot.data.currentSavingsRatePercent)} rate`}
            icon={PiggyBank}
            tone={snapshot.data.savingsShortfall > 0 ? 'warning' : 'success'}
          />
          <StatCard
            label="Emergency fund"
            value={`${snapshot.data.emergencyFundMonths.toFixed(1)} months`}
            hint={`Target ${snapshot.data.emergencyFundTargetMonths} months · ${formatCurrency(snapshot.data.emergencyFundBalance)}`}
            icon={ShieldCheck}
            tone={snapshot.data.emergencyFundMonths < snapshot.data.emergencyFundTargetMonths ? 'warning' : 'success'}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Cash flow this month</h2>
              <Link href="/dashboard/transactions" className="text-xs text-primary hover:underline">
                View transactions →
              </Link>
            </div>
            {snapshot.loading ? (
              <div className="h-64 animate-pulse rounded-md bg-muted" />
            ) : (
              <CashFlowChart data={snapshot.data?.dailyCashFlow ?? []} />
            )}
          </div>

          <div className="surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent purchase decisions</h2>
              <Link href="/dashboard/purchases" className="text-xs text-primary hover:underline">
                Run a new simulation →
              </Link>
            </div>
            {purchases.loading ? (
              <div className="h-40 animate-pulse rounded-md bg-muted" />
            ) : (
              <PurchaseHistoryTable rows={purchases.data?.items ?? []} />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <AskAiCard />

          <div className="surface p-5">
            <h2 className="mb-3 text-sm font-semibold">Spending by category</h2>
            {snapshot.loading ? (
              <div className="h-64 animate-pulse rounded-md bg-muted" />
            ) : (
              <CategoryChart data={snapshot.data?.categoryBreakdown ?? []} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
