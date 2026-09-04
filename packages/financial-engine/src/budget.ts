import {
  BUDGET_PRESETS,
  BudgetStrategy,
  CATEGORIES,
  CategoryKind,
  RiskLevel,
  type BudgetStatus,
  type EngineBudget,
  type EngineContext,
  type FinancialSnapshot,
  type Minor,
  categoryLabel,
  clampNonNegative,
  fromMinor,
  mulMinor,
  presetFor,
  round,
  safeRatio,
  toMinor,
  toPercent,
} from '@flowmoney/shared-types';
import type { SnapshotInternals } from './snapshot';

function severityForOverage(ratio: number): RiskLevel {
  if (ratio >= 1.5) return RiskLevel.CRITICAL;
  if (ratio >= 1.2) return RiskLevel.HIGH;
  if (ratio >= 1) return RiskLevel.MODERATE;
  return RiskLevel.LOW;
}

/**
 * Builds the per-category allocation a strategy implies, using each category's
 * typical share of its envelope. Used when a user picks a strategy but has not
 * hand-tuned individual categories.
 */
export function deriveAllocations(
  monthlyIncome: number,
  strategy: BudgetStrategy,
  overrides?: Partial<Record<'needsPercent' | 'wantsPercent' | 'savingsPercent' | 'investmentsPercent' | 'debtPercent', number>>,
): Array<{ categoryKey: string; categoryKind: CategoryKind; allocated: number }> {
  const preset = presetFor(strategy);
  const needsPercent = overrides?.needsPercent ?? preset.needsPercent;
  const wantsPercent = overrides?.wantsPercent ?? preset.wantsPercent;
  const savingsPercent = overrides?.savingsPercent ?? preset.savingsPercent;
  const investmentsPercent = overrides?.investmentsPercent ?? preset.investmentsPercent;
  const debtPercent = overrides?.debtPercent ?? preset.debtPercent;

  const income = toMinor(monthlyIncome);
  const envelopes: Array<[CategoryKind, Minor]> = [
    [CategoryKind.ESSENTIAL, mulMinor(income, needsPercent / 100)],
    [CategoryKind.DISCRETIONARY, mulMinor(income, wantsPercent / 100)],
  ];

  const rows: Array<{ categoryKey: string; categoryKind: CategoryKind; allocated: number }> = [];

  for (const [kind, envelope] of envelopes) {
    const members = CATEGORIES.filter((c) => c.kind === kind && c.defaultShare > 0);
    const shareTotal = members.reduce((sum, c) => sum + c.defaultShare, 0) || 1;
    for (const category of members) {
      rows.push({
        categoryKey: category.key,
        categoryKind: kind,
        allocated: fromMinor(mulMinor(envelope, category.defaultShare / shareTotal)),
      });
    }
  }

  rows.push({
    categoryKey: 'savings',
    categoryKind: CategoryKind.SAVINGS,
    allocated: fromMinor(mulMinor(income, savingsPercent / 100)),
  });
  if (investmentsPercent > 0) {
    rows.push({
      categoryKey: 'investments',
      categoryKind: CategoryKind.INVESTMENT,
      allocated: fromMinor(mulMinor(income, investmentsPercent / 100)),
    });
  }
  if (debtPercent > 0) {
    rows.push({
      categoryKey: 'debt_repayment',
      categoryKind: CategoryKind.DEBT,
      allocated: fromMinor(mulMinor(income, debtPercent / 100)),
    });
  }

  return rows;
}

export function computeBudgetStatus(
  ctx: EngineContext,
  snapshot: FinancialSnapshot,
  internals: SnapshotInternals,
): BudgetStatus {
  const budget: EngineBudget | null = ctx.budget;
  const planned = internals.planned;
  const actual = internals.actual;

  const variance = {
    needs: fromMinor((planned.needs - actual.needs) as Minor),
    wants: fromMinor((planned.wants - actual.wants) as Minor),
    savings: fromMinor((actual.savings - planned.savings) as Minor),
    investments: fromMinor((actual.investments - planned.investments) as Minor),
    debt: fromMinor((planned.debt - actual.debt) as Minor),
  };

  const totalAllocated = (planned.needs + planned.wants + planned.debt) as Minor;
  const totalSpent = (actual.needs + actual.wants + actual.debt) as Minor;
  const remaining = clampNonNegative(totalAllocated - totalSpent);

  const ruleViolations: BudgetStatus['ruleViolations'] = [];
  const spendByCategory = new Map(
    snapshot.categoryBreakdown.map((c) => [c.categoryKey, toMinor(c.spent)]),
  );

  for (const rule of budget?.rules ?? []) {
    const limit = toMinor(rule.amount);
    if (limit <= 0) continue;

    if (rule.type === 'CATEGORY_MAX' && rule.categoryKey) {
      const spent = spendByCategory.get(rule.categoryKey) ?? 0;
      if (spent > limit) {
        ruleViolations.push({
          label: rule.label || `${categoryLabel(rule.categoryKey)} cap`,
          type: rule.type,
          limit: fromMinor(limit),
          actual: fromMinor(spent as Minor),
          exceededBy: fromMinor((spent - limit) as Minor),
          severity: severityForOverage(safeRatio(spent, limit)),
        });
      }
    } else if (rule.type === 'CATEGORY_MIN' && rule.categoryKey) {
      const spent = spendByCategory.get(rule.categoryKey) ?? 0;
      if (snapshot.period.daysRemaining === 0 && spent < limit) {
        ruleViolations.push({
          label: rule.label || `${categoryLabel(rule.categoryKey)} minimum`,
          type: rule.type,
          limit: fromMinor(limit),
          actual: fromMinor(spent as Minor),
          exceededBy: fromMinor((limit - spent) as Minor),
          severity: RiskLevel.MODERATE,
        });
      }
    } else if (rule.type === 'SAVINGS_MIN') {
      // Only a violation once the month can no longer catch up on pace.
      const paceTarget = mulMinor(limit, snapshot.period.daysElapsed / snapshot.period.totalDays);
      if (actual.savings < paceTarget) {
        ruleViolations.push({
          label: rule.label || 'Minimum monthly savings',
          type: rule.type,
          limit: fromMinor(limit),
          actual: fromMinor(actual.savings),
          exceededBy: fromMinor((limit - actual.savings) as Minor),
          severity: actual.savings < mulMinor(paceTarget, 0.5) ? RiskLevel.HIGH : RiskLevel.MODERATE,
        });
      }
    } else if (rule.type === 'TOTAL_SPEND_MAX') {
      if (totalSpent > limit) {
        ruleViolations.push({
          label: rule.label || 'Total monthly spend cap',
          type: rule.type,
          limit: fromMinor(limit),
          actual: fromMinor(totalSpent),
          exceededBy: fromMinor((totalSpent - limit) as Minor),
          severity: severityForOverage(safeRatio(totalSpent, limit)),
        });
      }
    }
  }

  const projectedOverspend = clampNonNegative(internals.projectedMonthEndSpend - totalAllocated);
  const daysRemaining = snapshot.period.daysRemaining;

  return {
    budgetId: budget?.id ?? null,
    strategy: budget?.strategy ?? null,
    periodStart: snapshot.period.start,
    periodEnd: snapshot.period.end,
    monthlyIncome: snapshot.monthlyIncome,
    planned: {
      needs: fromMinor(planned.needs),
      wants: fromMinor(planned.wants),
      savings: fromMinor(planned.savings),
      investments: fromMinor(planned.investments),
      debt: fromMinor(planned.debt),
    },
    actual: {
      needs: fromMinor(actual.needs),
      wants: fromMinor(actual.wants),
      savings: fromMinor(actual.savings),
      investments: fromMinor(actual.investments),
      debt: fromMinor(actual.debt),
    },
    variance,
    totalAllocated: fromMinor(totalAllocated),
    totalSpent: fromMinor(totalSpent),
    remaining: fromMinor(remaining),
    adherencePercent: snapshot.budgetAdherencePercent,
    projectedMonthEndSpend: fromMinor(internals.projectedMonthEndSpend),
    projectedOverspend: fromMinor(projectedOverspend),
    categories: snapshot.categoryBreakdown,
    ruleViolations,
    daysRemaining,
    safeDailySpend: round(
      fromMinor(
        Math.round(internals.discretionaryBudgetRemaining / Math.max(daysRemaining, 1)) as Minor,
      ),
      2,
    ),
  };
}

export function strategyCatalogue() {
  return [
    ...Object.values(BUDGET_PRESETS),
    {
      strategy: BudgetStrategy.CUSTOM,
      name: 'Custom Budget',
      tagline: 'Define your own split and per-category caps.',
      needsPercent: 50,
      wantsPercent: 30,
      savingsPercent: 20,
      investmentsPercent: 0,
      debtPercent: 0,
    },
  ];
}

export { toPercent };
