import {
  ANOMALY_POLICY,
  CategoryKind,
  RiskLevel,
  type EngineContext,
  type EngineTransaction,
  type FinancialSnapshot,
  type SpendingAnomaly,
  formatINR,
  round,
  safeRatio,
  toPercent,
} from '@flowmoney/shared-types';
import { mean, standardDeviation } from './aggregate';
import type { SnapshotInternals } from './snapshot';

function severityFromDeviation(deviationPercent: number): RiskLevel {
  if (deviationPercent >= 400) return RiskLevel.CRITICAL;
  if (deviationPercent >= 200) return RiskLevel.HIGH;
  if (deviationPercent >= 100) return RiskLevel.MODERATE;
  return RiskLevel.LOW;
}

/**
 * Statistical anomaly detection over the user's own history.
 *
 * This module flags and explains; it never freezes an account, reverses a
 * charge or moves money. Any such action requires a real banking integration
 * and an explicit authorisation flow.
 */
export function detectSpendingAnomalies(
  ctx: EngineContext,
  snapshot: FinancialSnapshot,
  internals: SnapshotInternals,
  lookbackDays = 30,
): SpendingAnomaly[] {
  const anomalies: SpendingAnomaly[] = [];
  const asOf = internals.asOf.getTime();
  const cutoff = asOf - lookbackDays * 86_400_000;

  const debits = ctx.transactions.filter(
    (t) => t.direction === 'DEBIT' && !t.isPending && t.categoryKind !== CategoryKind.TRANSFER,
  );
  const recent = debits.filter((t) => new Date(t.occurredAt).getTime() >= cutoff);
  if (debits.length < 10) return anomalies;

  // ---- amount outliers, per category, against the user's own distribution ---
  const byCategory = new Map<string, EngineTransaction[]>();
  for (const txn of debits) {
    const list = byCategory.get(txn.categoryKey) ?? [];
    list.push(txn);
    byCategory.set(txn.categoryKey, list);
  }

  for (const txn of recent) {
    const history = (byCategory.get(txn.categoryKey) ?? []).filter((t) => t.id !== txn.id);
    if (history.length < 5) continue;
    const amounts = history.map((t) => t.amount);
    const avg = mean(amounts);
    const sd = standardDeviation(amounts);
    if (sd <= 0) continue;
    const z = (txn.amount - avg) / sd;
    if (z < ANOMALY_POLICY.amountZScoreThreshold) continue;

    const deviationPercent = toPercent(safeRatio(txn.amount - avg, avg));
    anomalies.push({
      transactionId: txn.id,
      type: 'AMOUNT_OUTLIER',
      severity: severityFromDeviation(deviationPercent),
      title: `Unusually large ${txn.categoryKey.replace(/_/g, ' ')} charge`,
      detail: `${formatINR(txn.amount)} at ${txn.merchantName ?? txn.description ?? 'an unnamed merchant'} is ${round(z, 1)} standard deviations above your typical ${formatINR(avg)} in this category.`,
      amount: txn.amount,
      baseline: round(avg, 2),
      deviationPercent,
      occurredAt: txn.occurredAt,
    });
  }

  // ---- first-time merchant taking a large share of monthly income ----------
  const knownMerchants = new Set(
    debits
      .filter((t) => new Date(t.occurredAt).getTime() < cutoff)
      .map((t) => (t.merchantName ?? '').toLowerCase())
      .filter(Boolean),
  );
  const incomeThreshold = snapshot.monthlyIncome * ANOMALY_POLICY.newMerchantIncomeShare;
  for (const txn of recent) {
    const merchant = (txn.merchantName ?? '').toLowerCase();
    if (!merchant || knownMerchants.has(merchant)) continue;
    if (incomeThreshold <= 0 || txn.amount < incomeThreshold) continue;
    anomalies.push({
      transactionId: txn.id,
      type: 'NEW_MERCHANT_HIGH_VALUE',
      severity: RiskLevel.HIGH,
      title: `First payment to ${txn.merchantName} is high value`,
      detail: `${formatINR(txn.amount)} is ${toPercent(safeRatio(txn.amount, snapshot.monthlyIncome))}% of your monthly income and this merchant has not appeared in your history before.`,
      amount: txn.amount,
      baseline: round(incomeThreshold, 2),
      deviationPercent: toPercent(safeRatio(txn.amount - incomeThreshold, incomeThreshold)),
      occurredAt: txn.occurredAt,
    });
  }

  // ---- category spikes against the trailing three-month average ------------
  const completed = internals.monthlyAggregates.filter((a) => a.month !== internals.period.key);
  if (completed.length >= 2) {
    for (const category of snapshot.categoryBreakdown) {
      const historical = debits.filter(
        (t) =>
          t.categoryKey === category.categoryKey &&
          new Date(t.occurredAt).getTime() < internals.period.start.getTime(),
      );
      if (historical.length < 4) continue;
      const monthsSpanned = Math.max(completed.length, 1);
      const monthlyAverage = historical.reduce((s, t) => s + t.amount, 0) / monthsSpanned;
      if (monthlyAverage <= 0) continue;
      const ratio = safeRatio(category.spent, monthlyAverage);
      if (ratio < ANOMALY_POLICY.categorySpikeMultiple) continue;
      anomalies.push({
        transactionId: null,
        type: 'CATEGORY_SPIKE',
        severity: severityFromDeviation(toPercent(ratio - 1)),
        title: `${category.categoryLabel} spending has spiked`,
        detail: `${formatINR(category.spent)} this month against a ${formatINR(monthlyAverage)} monthly average — ${toPercent(ratio - 1)}% higher.`,
        amount: category.spent,
        baseline: round(monthlyAverage, 2),
        deviationPercent: toPercent(ratio - 1),
        occurredAt: snapshot.asOf,
      });
    }
  }

  // ---- velocity and duplicates --------------------------------------------
  const sorted = [...recent].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
  const velocityWindow = ANOMALY_POLICY.velocityWindowHours * 3_600_000;
  const duplicateWindow = ANOMALY_POLICY.duplicateWindowMinutes * 60_000;

  for (let i = 0; i < sorted.length; i += 1) {
    const txn = sorted[i];
    if (!txn) continue;
    const time = new Date(txn.occurredAt).getTime();

    const burst = sorted.filter((other) => {
      if (!other.merchantName || other.merchantName !== txn.merchantName) return false;
      const delta = new Date(other.occurredAt).getTime() - time;
      return delta >= 0 && delta <= velocityWindow;
    });
    if (burst.length >= ANOMALY_POLICY.velocityCount) {
      const total = burst.reduce((s, t) => s + t.amount, 0);
      anomalies.push({
        transactionId: txn.id,
        type: 'VELOCITY',
        severity: RiskLevel.HIGH,
        title: `${burst.length} rapid charges at ${txn.merchantName}`,
        detail: `${burst.length} transactions totalling ${formatINR(total)} within ${ANOMALY_POLICY.velocityWindowHours} hours.`,
        amount: total,
        baseline: txn.amount,
        deviationPercent: toPercent(burst.length - 1),
        occurredAt: txn.occurredAt,
      });
      i += burst.length - 1;
      continue;
    }

    const next = sorted[i + 1];
    if (
      next &&
      next.amount === txn.amount &&
      next.merchantName === txn.merchantName &&
      new Date(next.occurredAt).getTime() - time <= duplicateWindow
    ) {
      anomalies.push({
        transactionId: next.id,
        type: 'DUPLICATE',
        severity: RiskLevel.MODERATE,
        title: 'Possible duplicate charge',
        detail: `Two identical ${formatINR(txn.amount)} charges at ${txn.merchantName ?? 'the same merchant'} within ${ANOMALY_POLICY.duplicateWindowMinutes} minutes.`,
        amount: txn.amount,
        baseline: txn.amount,
        deviationPercent: 100,
        occurredAt: next.occurredAt,
      });
    }
  }

  const order: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  return anomalies
    .sort((a, b) => order[a.severity] - order[b.severity] || b.amount - a.amount)
    .slice(0, 12);
}
