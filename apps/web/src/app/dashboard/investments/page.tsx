'use client';

import { useState } from 'react';
import { Info, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/format';

interface IdleCashAnalysis {
  averageBalance: number;
  currentBalance: number;
  upcomingExpenses30d: number;
  emergencyReserve: number;
  surplusCash: number;
  hasSurplus: boolean;
  explanation: string;
}

interface AllocationSuggestion {
  bucket: string;
  label: string;
  amount: number;
  percentOfSurplus: number;
  riskLevel: string;
  liquidity: string;
  horizon: string;
  illustrativeAnnualReturnPercent: { low: number; high: number } | null;
  rationale: string;
}

interface AllocationPlan {
  surplusCash: number;
  suggestions: AllocationSuggestion[];
  totalAllocated: number;
  disclaimer: string;
}

interface Recommendations {
  idleCash: IdleCashAnalysis;
  allocation: AllocationPlan | null;
}

interface InvestmentProfile {
  riskTolerance: string;
  horizon: string;
  monthlyInvestmentCapacity: number;
  portfolioValue: number;
  totalInvested: number;
  holdings: Array<{ id: string; name: string; type: string; currentValue: number; gainPercent: number }>;
}

const RISK_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  LOW: 'success',
  MODERATE: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export default function InvestmentsPage() {
  const profile = useApi<InvestmentProfile>('/investment/profile');
  const recommendations = useApi<Recommendations>('/investment/recommendations');
  const [riskTolerance, setRiskTolerance] = useState('');
  const [saving, setSaving] = useState(false);

  async function updateRisk(value: string) {
    setRiskTolerance(value);
    setSaving(true);
    try {
      await api.post('/investment/profile', {
        riskTolerance: value,
        horizon: profile.data?.horizon ?? 'MEDIUM',
        monthlyInvestmentCapacity: profile.data?.monthlyInvestmentCapacity ?? 0,
      });
      profile.refetch();
      recommendations.refetch();
    } catch {
      // best-effort — the select stays in sync with fetched state on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Investments &amp; Idle Cash</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Educational allocation simulations — nothing here places an order or moves money.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="stat-label">Portfolio value</p>
          <p className="stat-value mt-2">{formatCurrency(profile.data?.portfolioValue ?? 0)}</p>
        </div>
        <div className="surface p-5">
          <p className="stat-label">Total invested</p>
          <p className="stat-value mt-2">{formatCurrency(profile.data?.totalInvested ?? 0)}</p>
        </div>
        <div className="surface p-5">
          <p className="stat-label">Risk tolerance</p>
          <Select
            className="mt-2"
            value={riskTolerance || profile.data?.riskTolerance || 'MODERATE'}
            onChange={(e) => void updateRisk(e.target.value)}
            disabled={saving}
          >
            <option value="CONSERVATIVE">Conservative</option>
            <option value="MODERATE">Moderate</option>
            <option value="AGGRESSIVE">Aggressive</option>
          </Select>
        </div>
      </div>

      {profile.data && profile.data.holdings.length > 0 && (
        <div className="surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Holdings</h2>
          <div className="space-y-2">
            {profile.data.holdings.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{h.type}</p>
                </div>
                <div className="text-right">
                  <p className="tabular font-medium">{formatCurrency(h.currentValue)}</p>
                  <p className={`text-xs ${h.gainPercent >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {h.gainPercent >= 0 ? '+' : ''}
                    {formatPercent(h.gainPercent)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="surface p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <PiggyBank className="h-4 w-4 text-primary" /> Idle cash detection
        </h2>
        {recommendations.loading ? (
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        ) : recommendations.data ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{recommendations.data.idleCash.explanation}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Average balance" value={formatCurrency(recommendations.data.idleCash.averageBalance)} />
              <Metric label="Upcoming 30d expenses" value={formatCurrency(recommendations.data.idleCash.upcomingExpenses30d)} />
              <Metric label="Emergency reserve" value={formatCurrency(recommendations.data.idleCash.emergencyReserve)} />
              <Metric label="Surplus cash" value={formatCurrency(recommendations.data.idleCash.surplusCash)} />
            </div>
          </>
        ) : null}
      </div>

      {recommendations.data?.allocation ? (
        <div className="surface p-5">
          <h2 className="mb-4 text-sm font-semibold">
            Suggested allocation of {formatCurrency(recommendations.data.allocation.surplusCash)}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recommendations.data.allocation.suggestions.map((s) => (
              <div key={s.bucket} className="rounded-lg border border-border p-4">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-semibold">{s.label}</p>
                  <Badge tone={RISK_TONE[s.riskLevel] ?? 'neutral'}>{s.riskLevel}</Badge>
                </div>
                <p className="stat-value text-xl">{formatCurrency(s.amount)}</p>
                <p className="text-xs text-muted-foreground">{formatPercent(s.percentOfSurplus)} of surplus · {s.liquidity.toLowerCase()} liquidity · {s.horizon.toLowerCase()} horizon</p>
                {s.illustrativeAnnualReturnPercent && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Illustrative return {s.illustrativeAnnualReturnPercent.low}–{s.illustrativeAnnualReturnPercent.high}% p.a.
                  </p>
                )}
                <p className="mt-2 text-xs">{s.rationale}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {recommendations.data.allocation.disclaimer}
          </div>
        </div>
      ) : (
        !recommendations.loading && (
          <EmptyState
            title="No surplus cash detected"
            description="Once your balance clears upcoming expenses and your emergency reserve, allocation ideas will appear here."
          />
        )
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-sm font-semibold">{value}</p>
    </div>
  );
}
