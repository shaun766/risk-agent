'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Bot, MessageSquare, ShoppingBag, Users, Wallet } from 'lucide-react';
import { CardSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { formatCompact, formatPercent, RISK_STYLES, VERDICT_STYLES } from '@/lib/format';

interface AnalyticsResponse {
  users: { total: number; active: number };
  accounts: number;
  transactions: number;
  purchaseDecisions: Array<{ verdict: string; count: number; averageScore: number }>;
  financialHealth: { average: number; distribution: Record<string, number>; sampled: number };
  conversations: Array<{ channel: string; count: number }>;
  agentUsage: Array<{ agent: string; name: string; messages: number }>;
}

const VERDICT_COLOR: Record<string, string> = {
  SMART_BUY: 'hsl(var(--success))',
  AFFORDABLE_BUT_CAUTION: 'hsl(var(--warning))',
  WAIT_AND_SAVE: 'hsl(var(--warning))',
  NOT_RECOMMENDED: 'hsl(var(--destructive))',
};

const RISK_COLOR: Record<string, string> = {
  LOW: 'hsl(var(--success))',
  MODERATE: 'hsl(var(--warning))',
  HIGH: 'hsl(var(--destructive))',
  CRITICAL: 'hsl(var(--destructive))',
};

const RISK_ORDER = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

export default function AdminAnalyticsPage() {
  const analytics = useApi<AnalyticsResponse>('/admin/analytics');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Anonymized, aggregate platform metrics — no per-customer data appears here.
        </p>
      </div>

      {analytics.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : analytics.error ? (
        <ErrorState message={analytics.error} retry={analytics.refetch} />
      ) : analytics.data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} label="Total users" value={analytics.data.users.total.toLocaleString('en-IN')} />
            <StatCard
              icon={Activity}
              label="Active users"
              value={analytics.data.users.active.toLocaleString('en-IN')}
              hint={
                analytics.data.users.total > 0
                  ? `${formatPercent((analytics.data.users.active / analytics.data.users.total) * 100)} of total`
                  : undefined
              }
            />
            <StatCard icon={Wallet} label="Linked accounts" value={analytics.data.accounts.toLocaleString('en-IN')} />
            <StatCard
              icon={ShoppingBag}
              label="Transactions"
              value={formatCompact(analytics.data.transactions).replace('₹', '')}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="surface p-5">
              <h2 className="mb-4 text-sm font-semibold">Purchase decisions by verdict</h2>
              {analytics.data.purchaseDecisions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No purchase decisions recorded yet</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={analytics.data.purchaseDecisions}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="verdict"
                        width={140}
                        tickFormatter={(v: string) => VERDICT_STYLES[v]?.label ?? v}
                        tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value: number, _name, item) => [
                          `${value} decisions`,
                          `avg score ${Math.round(item.payload.averageScore)}`,
                        ]}
                        labelFormatter={(v: string) => VERDICT_STYLES[v]?.label ?? v}
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {analytics.data.purchaseDecisions.map((entry) => (
                          <Cell key={entry.verdict} fill={VERDICT_COLOR[entry.verdict] ?? 'hsl(var(--primary))'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {analytics.data.purchaseDecisions.map((v) => {
                      const style = VERDICT_STYLES[v.verdict] ?? { label: v.verdict, tone: 'neutral' as const };
                      return (
                        <Badge key={v.verdict} tone={style.tone}>
                          {style.label} · {v.count}
                        </Badge>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Financial health distribution</h2>
                <span className="text-xs text-muted-foreground">
                  avg {Math.round(analytics.data.financialHealth.average)}/100 · n={analytics.data.financialHealth.sampled}
                </span>
              </div>
              {RISK_ORDER.every((k) => !analytics.data!.financialHealth.distribution[k]) ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No health scores sampled yet</p>
              ) : (
                <div className="space-y-3">
                  {RISK_ORDER.filter((k) => analytics.data!.financialHealth.distribution[k] !== undefined).map((key) => {
                    const count = analytics.data!.financialHealth.distribution[key] ?? 0;
                    const total = analytics.data!.financialHealth.sampled || 1;
                    const pct = (count / total) * 100;
                    const style = RISK_STYLES[key];
                    return (
                      <div key={key}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium">{style?.label ?? key}</span>
                          <span className="tabular text-muted-foreground">
                            {count} · {formatPercent(pct, 0)}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: RISK_COLOR[key] ?? 'hsl(var(--primary))' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="surface p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-primary" /> Conversations by channel
              </h2>
              {analytics.data.conversations.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No conversations recorded yet</p>
              ) : (
                <div className="space-y-3">
                  {analytics.data.conversations
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((c) => {
                      const max = Math.max(...analytics.data!.conversations.map((x) => x.count), 1);
                      return (
                        <div key={c.channel}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium">{c.channel}</span>
                            <span className="tabular text-muted-foreground">{c.count}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${(c.count / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="surface p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-primary" /> Agent usage leaderboard
              </h2>
              {analytics.data.agentUsage.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No agent activity recorded yet</p>
              ) : (
                <div className="space-y-2">
                  {analytics.data.agentUsage
                    .slice()
                    .sort((a, b) => b.messages - a.messages)
                    .map((a, i) => (
                      <div key={a.agent} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {i + 1}
                          </span>
                          <span className="font-medium">{a.name}</span>
                        </div>
                        <span className="tabular text-muted-foreground">{a.messages} messages</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="stat-label">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="stat-value">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
