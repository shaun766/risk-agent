import {
  ADVICE_DISCLAIMER,
  Intent,
  RiskLevel,
  VERDICT_LABEL,
  type AllocationPlan,
  type BudgetStatus,
  type FinancialHealth,
  type FinancialSnapshot,
  type IdleCashAnalysis,
  type MonthlyReportData,
  type PurchaseDecision,
  type SavingsOpportunity,
  type SpendingAnomaly,
  type StructuredAIResponse,
  formatINR,
  round,
} from '@flowmoney/shared-types';
import type { TransactionSummaryRow } from './types';

export interface RenderedReply {
  text: string;
  structured: StructuredAIResponse;
  quickActions: Array<{ label: string; command: string }>;
}

const VERDICT_ICON: Record<string, string> = {
  SMART_BUY: '✅',
  AFFORDABLE_BUT_CAUTION: '⚠️',
  WAIT_AND_SAVE: '⏳',
  NOT_RECOMMENDED: '🛑',
};

const VERDICT_RISK: Record<string, RiskLevel> = {
  SMART_BUY: RiskLevel.LOW,
  AFFORDABLE_BUT_CAUTION: RiskLevel.MODERATE,
  WAIT_AND_SAVE: RiskLevel.HIGH,
  NOT_RECOMMENDED: RiskLevel.CRITICAL,
};

function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

/**
 * Deterministic response templates.
 *
 * These are the platform's fallback when no OpenAI key is configured, and they
 * are also the shape the LLM is asked to imitate. Because they are generated
 * from the same tool results the model sees, the offline path is never less
 * accurate than the online one — only less conversational.
 */
export function renderPurchaseDecision(
  decision: PurchaseDecision,
  userName: string,
): RenderedReply {
  const icon = VERDICT_ICON[decision.verdict] ?? '•';
  const label = VERDICT_LABEL[decision.verdict];

  const parts: string[] = [
    `${icon} *Purchase Analysis*`,
    '',
    `Verdict: *${label.toUpperCase()}*`,
    `Financial Score: ${decision.score}/100  ·  Confidence: ${decision.confidence}/100`,
    '',
    line('Purchase', formatINR(decision.purchasePrice)),
    line('Discretionary budget left', formatINR(decision.discretionaryBudgetRemaining)),
    line(
      decision.affordabilityGap < 0 ? 'Affordability gap' : 'Headroom after purchase',
      formatINR(Math.abs(decision.affordabilityGap)),
    ),
    line('Safely spendable cash', formatINR(decision.safelySpendableCash)),
  ];

  if (decision.upcomingRecurringPayments > 0) {
    parts.push(line('Bills still due this month', formatINR(decision.upcomingRecurringPayments)));
  }

  parts.push(
    '',
    `If you buy this now:`,
    `• Projected savings would move from ${formatINR(decision.projectedSavingsBeforePurchase)} to ${formatINR(decision.projectedSavingsAfterPurchase)}.`,
    `• Your savings rate would go from ${decision.projectedSavingsRateBefore}% to ${decision.projectedSavingsRateAfter}%.`,
    `• Emergency fund cover would move from ${decision.emergencyFundMonths} to ${decision.emergencyFundMonthsAfter} months of essential expenses.`,
  );

  if (decision.recurringImpact) {
    parts.push(
      `• It adds ${formatINR(decision.recurringImpact.monthlyCost)}/month — ${formatINR(decision.recurringImpact.annualCost)} a year, or ${decision.recurringImpact.percentOfMonthlyIncome}% of your monthly income.`,
    );
  }

  parts.push('', 'Why:');
  decision.primaryReasons.forEach((reason, index) => {
    parts.push(`${index + 1}. ${reason}`);
  });

  if (decision.savingPlan) {
    parts.push(
      '',
      `A plan that works: set aside ${formatINR(decision.savingPlan.suggestedMonthlyContribution)} per month and you reach ${formatINR(decision.purchasePrice)} in ${decision.savingPlan.monthsToTarget} month${decision.savingPlan.monthsToTarget === 1 ? '' : 's'}.`,
    );
  }

  parts.push(
    '',
    `Opportunity cost: ${formatINR(decision.purchasePrice)} left invested for ${decision.opportunityCost.horizonYears} years at an illustrative ${decision.opportunityCost.annualRatePercent}% would be about ${formatINR(decision.opportunityCost.futureValue)}. ${decision.opportunityCost.assumptionNote}`,
  );

  return {
    text: parts.join('\n'),
    structured: {
      summary: `${label} — score ${decision.score}/100 for a ${formatINR(decision.purchasePrice)} purchase.`,
      recommendation:
        decision.recommendedActions[0] ??
        (decision.verdict === 'SMART_BUY'
          ? 'This fits your plan — go ahead.'
          : 'Hold off until the numbers support it.'),
      reasons: decision.primaryReasons,
      nextActions: decision.recommendedActions,
      riskLevel: VERDICT_RISK[decision.verdict] ?? RiskLevel.MODERATE,
    },
    quickActions: [
      { label: 'Show detailed analysis', command: 'show detailed analysis' },
      ...(decision.savingPlan
        ? [{ label: 'Create savings goal', command: `create a savings goal for ${decision.purchasePrice}` }]
        : []),
      { label: 'Adjust budget', command: 'adjust my budget' },
    ],
  };
}

export function renderSnapshot(snapshot: FinancialSnapshot, userName: string): RenderedReply {
  const text = [
    `Here is where you stand, ${firstName(userName)}.`,
    '',
    line('Available balance', formatINR(snapshot.availableBalance)),
    line('Monthly income', formatINR(snapshot.monthlyIncome)),
    line('Spent this month', formatINR(snapshot.totalSpentThisPeriod)),
    line('Discretionary budget left', formatINR(snapshot.discretionaryBudgetRemaining)),
    line(
      'Savings',
      `${formatINR(snapshot.savingsProgress)} of a ${formatINR(snapshot.savingsTarget)} target`,
    ),
    line('Emergency fund', `${snapshot.emergencyFundMonths} months of essential expenses`),
    line('Safely spendable now', formatINR(snapshot.safelySpendableCash)),
    '',
    `${snapshot.period.daysRemaining} days left in the month. At your current pace you will spend about ${formatINR(snapshot.projectedMonthEndSpend)}, leaving a projected ${formatINR(snapshot.projectedSavings)} saved (${snapshot.projectedSavingsRatePercent}%).`,
  ].join('\n');

  return {
    text,
    structured: {
      summary: `Balance ${formatINR(snapshot.availableBalance)}, ${formatINR(snapshot.discretionaryBudgetRemaining)} of discretionary budget left, ${snapshot.emergencyFundMonths} months of emergency cover.`,
      recommendation:
        snapshot.savingsProgress < snapshot.savingsTarget
          ? `You are ${formatINR(snapshot.savingsShortfall)} short of this month's savings target.`
          : 'You are on track against your savings target.',
      reasons: [
        `Spent ${formatINR(snapshot.totalSpentThisPeriod)} of ${formatINR(snapshot.monthlyIncome)} income.`,
        `${formatINR(snapshot.upcomingRecurringPayments)} of committed payments still due.`,
      ],
      nextActions: ['Review your budget', 'Check savings opportunities'],
      riskLevel: snapshot.safelySpendableCash > 0 ? RiskLevel.LOW : RiskLevel.HIGH,
    },
    quickActions: [
      { label: 'This month’s report', command: 'show my monthly report' },
      { label: 'Budget status', command: 'how is my budget doing' },
    ],
  };
}

export function renderBudget(status: BudgetStatus): RenderedReply {
  const overspent = status.categories.filter((c) => c.allocated > 0 && c.spent > c.allocated);
  const text = [
    '📊 *Budget status*',
    '',
    line('Planned spending', formatINR(status.totalAllocated)),
    line('Spent so far', formatINR(status.totalSpent)),
    line('Remaining', formatINR(status.remaining)),
    line('Adherence', `${status.adherencePercent}%`),
    line('Safe daily spend', `${formatINR(status.safeDailySpend)} for ${status.daysRemaining} days`),
    '',
    overspent.length > 0
      ? `Over budget: ${overspent
          .map((c) => `${c.categoryLabel} (${formatINR(c.spent)} of ${formatINR(c.allocated)})`)
          .join(', ')}`
      : 'Every category is inside its allocation.',
    status.projectedOverspend > 0
      ? `At this pace you will finish the month ${formatINR(status.projectedOverspend)} over plan.`
      : `At this pace you will finish the month inside plan.`,
    ...status.ruleViolations.map(
      (v) => `⚠️ ${v.label}: ${formatINR(v.actual)} against a ${formatINR(v.limit)} limit.`,
    ),
  ].join('\n');

  return {
    text,
    structured: {
      summary: `${status.adherencePercent}% budget adherence with ${formatINR(status.remaining)} remaining.`,
      recommendation:
        status.projectedOverspend > 0
          ? `Cap discretionary spending at ${formatINR(status.safeDailySpend)} a day for the rest of the month.`
          : 'Keep going — your current pace lands inside the plan.',
      reasons: overspent.map(
        (c) => `${c.categoryLabel} is ${formatINR(c.spent - c.allocated)} over its allocation.`,
      ),
      nextActions: ['Adjust category limits', 'Review recent transactions'],
      riskLevel: status.projectedOverspend > 0 ? RiskLevel.HIGH : RiskLevel.LOW,
    },
    quickActions: [
      { label: 'Adjust budget', command: 'adjust my budget' },
      { label: 'Where can I save?', command: 'how can I save more' },
    ],
  };
}

export function renderHealth(health: FinancialHealth): RenderedReply {
  const text = [
    `💚 *Financial health: ${health.score}/100* (${health.riskLevel.toLowerCase()} risk)`,
    '',
    'Breakdown:',
    ...health.components.map((c) => `• ${c.label}: ${c.score}/${c.maxScore} — ${c.detail}`),
    '',
    ...(health.weaknesses.length ? ['What to work on:', ...health.weaknesses.map((w) => `• ${w}`)] : []),
  ]
    .filter(Boolean)
    .join('\n');

  return {
    text,
    structured: {
      summary: `Financial health ${health.score}/100 — ${health.riskLevel.toLowerCase()} risk.`,
      recommendation:
        health.weaknesses[0] ?? 'Your position is solid across every component we measure.',
      reasons: health.components.map((c) => `${c.label}: ${c.score}/${c.maxScore}`),
      nextActions: ['Improve your weakest component first'],
      riskLevel: health.riskLevel,
    },
    quickActions: [
      { label: 'How do I improve this?', command: 'how can I improve my financial health' },
      { label: 'Monthly report', command: 'show my monthly report' },
    ],
  };
}

export function renderSavings(
  idleCash: IdleCashAnalysis,
  opportunities: SavingsOpportunity[],
  allocation: AllocationPlan | null,
): RenderedReply {
  const parts: string[] = ['💰 *Savings opportunities*', '', idleCash.explanation];

  if (opportunities.length > 0) {
    parts.push('', 'Where the money is:');
    for (const opportunity of opportunities) {
      parts.push(
        `• ${opportunity.title} — about ${formatINR(opportunity.monthlySaving)}/month (${formatINR(opportunity.annualSaving)} a year). ${opportunity.evidence}`,
      );
    }
  }

  if (allocation && allocation.suggestions.length > 0) {
    parts.push('', `If you allocated the ${formatINR(allocation.surplusCash)} surplus:`);
    for (const suggestion of allocation.suggestions) {
      const range = suggestion.illustrativeAnnualReturnPercent
        ? ` · illustrative ${suggestion.illustrativeAnnualReturnPercent.low}–${suggestion.illustrativeAnnualReturnPercent.high}% a year`
        : '';
      parts.push(
        `• ${formatINR(suggestion.amount)} → ${suggestion.label} (${suggestion.riskLevel.toLowerCase()} risk, ${suggestion.liquidity.toLowerCase()} liquidity${range})`,
      );
      parts.push(`  ${suggestion.rationale}`);
    }
    parts.push('', ADVICE_DISCLAIMER);
  }

  const totalAnnual = opportunities.reduce((sum, o) => sum + o.annualSaving, 0);

  return {
    text: parts.join('\n'),
    structured: {
      summary: idleCash.hasSurplus
        ? `About ${formatINR(idleCash.surplusCash)} appears surplus to your next 30 days and your emergency reserve.`
        : 'No meaningful idle cash right now.',
      recommendation:
        opportunities[0]?.title ?? 'Keep your current allocation — nothing is obviously idle.',
      reasons: opportunities.map((o) => o.evidence),
      nextActions: allocation ? allocation.suggestions.map((s) => `${s.label}: ${formatINR(s.amount)}`) : [],
      riskLevel: RiskLevel.LOW,
    },
    quickActions: [
      { label: 'Create a savings goal', command: 'create a savings goal' },
      ...(totalAnnual > 0 ? [{ label: 'Show my budget', command: 'show my budget' }] : []),
    ],
  };
}

export function renderAnomalies(anomalies: SpendingAnomaly[]): RenderedReply {
  if (anomalies.length === 0) {
    return {
      text: 'Nothing unusual in your recent transactions. Everything is inside your normal patterns.',
      structured: {
        summary: 'No anomalies detected.',
        recommendation: 'No action needed.',
        reasons: [],
        nextActions: [],
        riskLevel: RiskLevel.LOW,
      },
      quickActions: [{ label: 'Show recent transactions', command: 'show my recent transactions' }],
    };
  }

  const text = [
    '🔍 *Unusual activity*',
    '',
    ...anomalies.map(
      (a) =>
        `• ${a.title} — ${formatINR(a.amount)} (${a.deviationPercent}% above a ${formatINR(a.baseline)} baseline). ${a.detail}`,
    ),
    '',
    'I can flag these but I cannot block or reverse a charge. If something here is genuinely not yours, contact your bank directly.',
  ].join('\n');

  return {
    text,
    structured: {
      summary: `${anomalies.length} unusual transaction pattern${anomalies.length === 1 ? '' : 's'} detected.`,
      recommendation: 'Review each flagged item and contact your bank if you do not recognise it.',
      reasons: anomalies.map((a) => a.detail),
      nextActions: ['Review flagged transactions'],
      riskLevel: anomalies[0]?.severity ?? RiskLevel.MODERATE,
    },
    quickActions: [{ label: 'Show transactions', command: 'show my recent transactions' }],
  };
}

export function renderMonthlyReport(report: MonthlyReportData): RenderedReply {
  const change = report.previousMonth
    ? round(report.overview.totalSpending - report.previousMonth.totalSpending, 2)
    : null;

  const text = [
    `📅 *${report.month} report*`,
    '',
    line('Income', formatINR(report.overview.income)),
    line('Total spending', formatINR(report.overview.totalSpending)),
    line('Saved', `${formatINR(report.overview.savings)} (${report.overview.savingsRatePercent}%)`),
    line('Invested', formatINR(report.overview.investments)),
    ...(change !== null
      ? [
          line(
            'Versus last month',
            `${change >= 0 ? '+' : '−'}${formatINR(Math.abs(change))} spending`,
          ),
        ]
      : []),
    '',
    'Top categories:',
    ...report.spendingBreakdown
      .slice(0, 5)
      .map((c) => `• ${c.categoryLabel}: ${formatINR(c.spent)}`),
    ...(report.insights.length
      ? ['', 'What stood out:', ...report.insights.slice(0, 3).map((i) => `• ${i.headline}`)]
      : []),
    '',
    `Financial health: ${report.health.score}/100 (${report.health.riskLevel.toLowerCase()} risk).`,
    ...(report.recommendations.length
      ? [
          '',
          'Recommendations:',
          ...report.recommendations
            .slice(0, 3)
            .map((r) => `• ${r.title} — worth about ${formatINR(r.impact)}.`),
        ]
      : []),
    '',
    `Next month forecast: about ${formatINR(report.forecast.projectedSpending)} spent and ${formatINR(report.forecast.projectedSavings)} saved.`,
  ].join('\n');

  return {
    text,
    structured: {
      summary: `${report.month}: ${formatINR(report.overview.totalSpending)} spent, ${formatINR(report.overview.savings)} saved (${report.overview.savingsRatePercent}%).`,
      recommendation: report.recommendations[0]?.title ?? 'Hold your current course.',
      reasons: report.insights.slice(0, 3).map((i) => i.headline),
      nextActions: report.recommendations.slice(0, 3).map((r) => r.title),
      riskLevel: report.health.riskLevel,
    },
    quickActions: [
      { label: 'Download PDF', command: 'export this report as pdf' },
      { label: 'Financial health', command: 'what is my financial health score' },
    ],
  };
}

export function renderTransactions(rows: TransactionSummaryRow[]): RenderedReply {
  if (rows.length === 0) {
    return {
      text: 'No transactions found for that period.',
      structured: {
        summary: 'No matching transactions.',
        recommendation: 'Try widening the date range.',
        reasons: [],
        nextActions: [],
        riskLevel: RiskLevel.LOW,
      },
      quickActions: [],
    };
  }

  const total = rows.filter((r) => r.direction === 'DEBIT').reduce((sum, r) => sum + r.amount, 0);
  const text = [
    `🧾 *Recent transactions* (${rows.length})`,
    '',
    ...rows
      .slice(0, 12)
      .map(
        (r) =>
          `${r.occurredAt.slice(0, 10)}  ${r.direction === 'DEBIT' ? '−' : '+'}${formatINR(r.amount)}  ${r.merchant ?? r.description}`,
      ),
    '',
    `Total spent across these: ${formatINR(total)}.`,
  ].join('\n');

  return {
    text,
    structured: {
      summary: `${rows.length} transactions totalling ${formatINR(total)} in spending.`,
      recommendation: 'Check anything you do not recognise.',
      reasons: [],
      nextActions: [],
      riskLevel: RiskLevel.LOW,
    },
    quickActions: [{ label: 'Check for anything unusual', command: 'any unusual transactions?' }],
  };
}

export function renderGreeting(userName: string, snapshot: FinancialSnapshot): RenderedReply {
  const text = [
    `Hi ${firstName(userName)} 👋`,
    '',
    `You have ${formatINR(snapshot.availableBalance)} available and ${formatINR(snapshot.discretionaryBudgetRemaining)} of discretionary budget left with ${snapshot.period.daysRemaining} days to go.`,
    '',
    'You can ask me things like:',
    '• "Can I afford a ₹20,000 trip this month?"',
    '• "How much did I spend on dining?"',
    '• "Where should I put my extra ₹30,000?"',
    '• "How am I doing financially?"',
  ].join('\n');

  return {
    text,
    structured: {
      summary: `${formatINR(snapshot.availableBalance)} available, ${formatINR(snapshot.discretionaryBudgetRemaining)} discretionary budget left.`,
      recommendation: 'Ask me about a purchase, your budget, or your savings.',
      reasons: [],
      nextActions: [],
      riskLevel: RiskLevel.LOW,
    },
    quickActions: [
      { label: 'How am I doing?', command: 'how am I doing financially' },
      { label: 'This month’s spending', command: 'how much did I spend this month' },
    ],
  };
}

export function renderFallback(intent: Intent, snapshot: FinancialSnapshot | null): RenderedReply {
  const base = snapshot
    ? `You have ${formatINR(snapshot.availableBalance)} available and ${formatINR(snapshot.discretionaryBudgetRemaining)} of discretionary budget left this month.`
    : 'I could not read your accounts just now.';

  return {
    text: [
      "I can help with purchases, budgets, savings, investments and your monthly report.",
      '',
      base,
      '',
      'Try: "Can I afford a ₹15,000 phone?" or "How much did I spend on dining this month?"',
    ].join('\n'),
    structured: {
      summary: 'Request understood but no specific analysis matched.',
      recommendation: 'Ask about a purchase, budget, savings or your monthly report.',
      reasons: [],
      nextActions: [],
      riskLevel: RiskLevel.LOW,
    },
    quickActions: [
      { label: 'How am I doing?', command: 'how am I doing financially' },
      { label: 'Can I afford something?', command: 'can I afford' },
    ],
  };
}
