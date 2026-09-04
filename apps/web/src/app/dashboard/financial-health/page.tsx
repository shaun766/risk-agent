'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ScoreRing } from '@/components/ui/score-ring';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { monthLabel, RISK_STYLES } from '@/lib/format';
import type { FinancialHealth } from '@/lib/types';

export default function FinancialHealthPage() {
  const health = useApi<FinancialHealth>('/financial-health');

  if (health.loading || !health.data) {
    return <div className="mx-auto max-w-5xl"><div className="h-96 animate-pulse rounded-lg bg-muted" /></div>;
  }

  const data = health.data;
  const riskStyle = RISK_STYLES[data.riskLevel];
  const trend = (data.trend ?? []).map((t) => ({ ...t, label: monthLabel(t.month) }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">Six weighted components, recomputed from your real transaction history.</p>
      </div>

      <div className="surface flex flex-col items-center gap-6 p-6 sm:flex-row">
        <ScoreRing score={data.score} size={140} strokeWidth={12} />
        <div>
          <p className="text-lg font-semibold">{Math.round(data.score)} / 100</p>
          {riskStyle && <Badge tone={riskStyle.tone}>{riskStyle.label}</Badge>}
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Your score blends savings rate, budget discipline, emergency fund coverage, debt burden, cash flow
            stability and investment progress.
          </p>
        </div>
      </div>

      {trend.length > 1 && (
        <div className="surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Score trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Component breakdown</h2>
        <div className="space-y-4">
          {data.components.map((c) => (
            <div key={c.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="tabular text-muted-foreground">
                  {c.score}/{c.maxScore}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(c.score / c.maxScore) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="surface p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> Strengths
          </h2>
          {data.strengths.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing stands out yet — keep building history.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="surface p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
            <XCircle className="h-4 w-4" /> Areas to improve
          </h2>
          {data.weaknesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No weak spots detected right now.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.weaknesses.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
