'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScoreRing } from '@/components/ui/score-ring';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatPercent, VERDICT_STYLES } from '@/lib/format';
import type { PurchaseDecision } from '@/lib/types';

interface Category {
  key: string;
  label: string;
}

export default function PurchaseSimulatorPage() {
  const categories = useApi<{ categories: Category[] }>('/transactions/categories');

  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('shopping');
  const [isRecurring, setIsRecurring] = useState(false);
  const [monthlyCost, setMonthlyCost] = useState('');
  const [importance, setImportance] = useState(3);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseDecision | null>(null);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!price || Number(price) <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const decision = await api.post<PurchaseDecision>('/purchase/analyze', {
        price: Number(price),
        category,
        description: item || undefined,
        merchant: item || undefined,
        isRecurring,
        monthlyCost: isRecurring && monthlyCost ? Number(monthlyCost) : undefined,
        importance,
        persist: true,
      });
      setResult(decision);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const style = result ? (VERDICT_STYLES[result.verdict] ?? { label: result.verdict, tone: 'neutral' as const }) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Purchase Simulator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A deterministic engine — never a language model — decides affordability. Every number below is real.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <form onSubmit={analyze} className="surface space-y-4 p-6 lg:col-span-2">
          <div>
            <Label htmlFor="item">What are you buying?</Label>
            <Input id="item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="PS5, concert tickets, laptop…" />
          </div>
          <div>
            <Label htmlFor="price">Price (₹)</Label>
            <Input
              id="price"
              type="number"
              min={1}
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="18000"
            />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {(categories.data?.categories ?? [{ key: 'shopping', label: 'Shopping' }]).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="importance">Necessity (1 = pure want, 5 = essential): {importance}</Label>
            <input
              id="importance"
              type="range"
              min={1}
              max={5}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="h-4 w-4 accent-primary" />
            This is a recurring monthly cost
          </label>
          {isRecurring && (
            <div>
              <Label htmlFor="monthlyCost">Monthly cost (₹)</Label>
              <Input
                id="monthlyCost"
                type="number"
                min={0}
                value={monthlyCost}
                onChange={(e) => setMonthlyCost(e.target.value)}
                placeholder="500"
              />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!price}>
            <Sparkles className="h-4 w-4" />
            Analyze Purchase
          </Button>
        </form>

        <div className="lg:col-span-3">
          {!result && !loading && (
            <div className="surface flex h-full min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 text-primary/40" />
              <p className="text-sm">Fill in the form and run an analysis to see your financial verdict.</p>
            </div>
          )}

          {loading && <div className="surface flex h-full min-h-[420px] animate-pulse items-center justify-center p-8 text-sm text-muted-foreground">Running the numbers…</div>}

          {result && (
            <div className="space-y-5">
              <div className="surface p-6">
                <div className="flex flex-col items-center gap-4 border-b border-border pb-6 text-center sm:flex-row sm:text-left">
                  <ScoreRing score={result.score} />
                  <div className="flex-1">
                    {style && (
                      <Badge tone={style.tone} className="mb-2 text-sm">
                        {style.label}
                      </Badge>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Confidence {Math.round(result.confidence)}% · Cash flow risk{' '}
                      <span className="font-medium">{result.cashFlowRiskLevel}</span>
                    </p>
                    <ul className="mt-3 space-y-1 text-sm">
                      {result.primaryReasons.map((reason, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-5 sm:grid-cols-3">
                  <Metric label="Purchase cost" value={formatCurrency(result.purchasePrice)} />
                  <Metric label="Discretionary budget remaining" value={formatCurrency(result.discretionaryBudgetRemaining)} />
                  <Metric
                    label="Remaining after purchase"
                    value={formatCurrency(result.discretionaryBudgetAfter)}
                    tone={result.discretionaryBudgetAfter < 0 ? 'danger' : 'default'}
                  />
                  <Metric label="Budget impact" value={formatPercent(result.budgetImpactPercentage)} />
                  <Metric
                    label="Savings rate before → after"
                    value={`${formatPercent(result.projectedSavingsRateBefore)} → ${formatPercent(result.projectedSavingsRateAfter)}`}
                    tone={result.projectedSavingsRateAfter < result.projectedSavingsRateBefore ? 'warning' : 'default'}
                  />
                  <Metric
                    label="Emergency fund after"
                    value={`${result.emergencyFundMonthsAfter.toFixed(1)} months`}
                    tone={result.emergencyReserveBreached ? 'danger' : 'default'}
                  />
                </div>

                {result.recommendedActions.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Recommendation
                    </p>
                    <ul className="space-y-1 text-sm">
                      {result.recommendedActions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {result.savingPlan && (
                <div className="surface p-5">
                  <p className="mb-2 text-sm font-semibold">Suggested savings plan</p>
                  <p className="text-sm text-muted-foreground">
                    Set aside <span className="font-medium text-foreground">{formatCurrency(result.savingPlan.suggestedMonthlyContribution)}</span> per
                    month for <span className="font-medium text-foreground">{result.savingPlan.monthsToTarget}</span> month(s) to comfortably afford this.
                  </p>
                </div>
              )}

              <div className="surface p-5">
                <p className="mb-1 text-sm font-semibold">Opportunity cost simulation</p>
                <p className="text-sm text-muted-foreground">
                  If {formatCurrency(result.purchasePrice)} were invested at an illustrative{' '}
                  {result.opportunityCost.annualRatePercent}% annual rate for {result.opportunityCost.horizonYears} years, it could grow to
                  approximately <span className="font-medium text-foreground">{formatCurrency(result.opportunityCost.futureValue)}</span> — foregone
                  growth of {formatCurrency(result.opportunityCost.foregoneGrowth)}.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{result.opportunityCost.assumptionNote}</p>
              </div>

              <div className="surface p-5">
                <p className="mb-3 text-sm font-semibold">Score breakdown</p>
                <div className="space-y-3">
                  {result.factors.map((factor) => (
                    <div key={factor.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{factor.label}</span>
                        <span className="text-muted-foreground">{Math.round(factor.score)}/100</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${factor.score}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{factor.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`tabular text-sm font-semibold ${
          tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
