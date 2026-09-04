'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { downloadFile } from '@/lib/api';
import { formatCurrency, formatPercent, monthLabel, RISK_STYLES } from '@/lib/format';
import type { CategorySpend } from '@/lib/types';

interface MonthlyReport {
  month: string;
  overview: {
    income: number;
    totalSpending: number;
    savings: number;
    investments: number;
    netCashFlow: number;
    savingsRatePercent: number;
  };
  spendingBreakdown: CategorySpend[];
  insights: Array<{ title: string; detail: string }>;
  health: { score: number; riskLevel: string };
  savingsPerformance: { target: number; actual: number; achievedPercent: number; shortfall: number };
  topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  recommendations: Array<{ title: string; detail: string; impact: number }>;
  forecast: { projectedSpending: number; projectedSavings: number; projectedBalance: number; basis: string };
  narrative: string | null;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonthKey());
  const report = useApi<MonthlyReport>(`/reports/monthly/${month}`, undefined, [month]);
  const [exporting, setExporting] = useState(false);

  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  async function exportPdf() {
    setExporting(true);
    try {
      await downloadFile(`/reports/monthly/${month}/export`, `flowmoney-${month}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  const riskStyle = report.data ? RISK_STYLES[report.data.health.riskLevel] : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monthly Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Deterministic analytics, written up for you.</p>
        </div>
        <div className="flex gap-2">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-44">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={exportPdf} loading={exporting}>
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {report.loading ? (
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      ) : report.data ? (
        <div className="space-y-6">
          {report.data.narrative && (
            <div className="surface mesh p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.data.narrative}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Income" value={formatCurrency(report.data.overview.income)} />
            <Metric label="Total spending" value={formatCurrency(report.data.overview.totalSpending)} />
            <Metric label="Savings" value={formatCurrency(report.data.overview.savings)} />
            <Metric label="Savings rate" value={formatPercent(report.data.overview.savingsRatePercent)} />
          </div>

          <div className="surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Financial health</h2>
              {riskStyle && <Badge tone={riskStyle.tone}>{riskStyle.label}</Badge>}
            </div>
            <p className="text-2xl font-semibold">{Math.round(report.data.health.score)}/100</p>
          </div>

          <div className="surface p-5">
            <h2 className="mb-3 text-sm font-semibold">Spending breakdown</h2>
            <div className="space-y-2">
              {report.data.spendingBreakdown
                .filter((c) => c.spent > 0)
                .sort((a, b) => b.spent - a.spent)
                .slice(0, 8)
                .map((c) => (
                  <div key={c.categoryKey} className="flex items-center justify-between text-sm">
                    <span>{c.categoryLabel}</span>
                    <span className="tabular font-medium">{formatCurrency(c.spent)}</span>
                  </div>
                ))}
            </div>
          </div>

          {report.data.insights.length > 0 && (
            <div className="surface p-5">
              <h2 className="mb-3 text-sm font-semibold">Behavioural insights</h2>
              <ul className="space-y-2 text-sm">
                {report.data.insights.map((insight, i) => (
                  <li key={i}>
                    <span className="font-medium">{insight.title}.</span> {insight.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.data.recommendations.length > 0 && (
            <div className="surface p-5">
              <h2 className="mb-3 text-sm font-semibold">Recommendations</h2>
              <ul className="space-y-2 text-sm">
                {report.data.recommendations.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{r.title}.</span> {r.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Next month forecast</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <Metric label="Projected spending" value={formatCurrency(report.data.forecast.projectedSpending)} />
              <Metric label="Projected savings" value={formatCurrency(report.data.forecast.projectedSavings)} />
              <Metric label="Projected balance" value={formatCurrency(report.data.forecast.projectedBalance)} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{report.data.forecast.basis}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-lg font-semibold">{value}</p>
    </div>
  );
}
