import {
  BudgetStrategy,
  CategoryKind,
  categoryKind,
  type EngineAccount,
  type EngineBudget,
  type EngineContext,
  type EngineTransaction,
  presetFor,
} from '@flowmoney/shared-types';

let counter = 0;
const nextId = () => `txn_${(counter += 1)}`;

export interface TxnSpec {
  amount: number;
  categoryKey: string;
  day: number;
  direction?: 'CREDIT' | 'DEBIT';
  merchantName?: string;
  isRecurring?: boolean;
  monthOffset?: number;
}

export interface PriorMonthSpec {
  income: number;
  essential: number;
  discretionary: number;
  savings?: number;
  investment?: number;
  debt?: number;
}

export interface ContextSpec {
  asOf?: string;
  accounts?: Array<Partial<EngineAccount>>;
  transactions?: TxnSpec[];
  priorMonths?: PriorMonthSpec[];
  obligations?: Array<{ label: string; amount: number; dueDay: number; categoryKey: string }>;
  strategy?: BudgetStrategy;
  monthlyIncome?: number;
  withBudget?: boolean;
  emergencyReserveAmount?: number | null;
  emergencyFundTargetMonths?: number;
  monthlyDebtPayments?: number;
  totalDebtOutstanding?: number;
  declaredMonthlyIncome?: number | null;
  savingsGoals?: EngineContext['savingsGoals'];
  portfolioValue?: number;
  investmentContributionsThisMonth?: number;
  allocations?: Array<{ categoryKey: string; allocated: number }>;
  rules?: EngineBudget['rules'];
}

const DEFAULT_AS_OF = '2026-03-15T12:00:00.000Z';

function makeTransaction(spec: TxnSpec, asOf: Date): EngineTransaction {
  const occurred = new Date(
    Date.UTC(
      asOf.getUTCFullYear(),
      asOf.getUTCMonth() + (spec.monthOffset ?? 0),
      spec.day,
      10,
      0,
      0,
    ),
  );
  const kind = categoryKind(spec.categoryKey);
  return {
    id: nextId(),
    amount: spec.amount,
    direction: spec.direction ?? (kind === CategoryKind.INCOME ? 'CREDIT' : 'DEBIT'),
    occurredAt: occurred.toISOString(),
    categoryKey: spec.categoryKey,
    categoryKind: kind,
    merchantName: spec.merchantName ?? null,
    description: spec.merchantName ?? spec.categoryKey,
    isRecurring: spec.isRecurring ?? false,
    isPending: false,
  };
}

/** Expands a prior-month summary into a handful of representative transactions. */
function expandPriorMonth(spec: PriorMonthSpec, monthOffset: number, asOf: Date): EngineTransaction[] {
  const rows: TxnSpec[] = [
    { amount: spec.income, categoryKey: 'salary', day: 1, monthOffset },
    { amount: spec.essential * 0.6, categoryKey: 'housing', day: 3, monthOffset, isRecurring: true },
    { amount: spec.essential * 0.25, categoryKey: 'groceries', day: 8, monthOffset },
    { amount: spec.essential * 0.15, categoryKey: 'utilities', day: 12, monthOffset, isRecurring: true },
    { amount: spec.discretionary * 0.5, categoryKey: 'dining', day: 10, monthOffset },
    { amount: spec.discretionary * 0.5, categoryKey: 'shopping', day: 18, monthOffset },
  ];
  if (spec.savings) rows.push({ amount: spec.savings, categoryKey: 'savings', day: 2, monthOffset });
  if (spec.investment) rows.push({ amount: spec.investment, categoryKey: 'investments', day: 2, monthOffset });
  if (spec.debt) rows.push({ amount: spec.debt, categoryKey: 'debt_repayment', day: 5, monthOffset });
  return rows.filter((r) => r.amount > 0).map((r) => makeTransaction(r, asOf));
}

export function makeContext(spec: ContextSpec = {}): EngineContext {
  const asOf = new Date(spec.asOf ?? DEFAULT_AS_OF);
  const strategy = spec.strategy ?? BudgetStrategy.BALANCED;
  const preset = presetFor(strategy);
  const monthlyIncome = spec.monthlyIncome ?? 75_000;

  const transactions: EngineTransaction[] = [];
  (spec.priorMonths ?? []).forEach((month, index, all) => {
    transactions.push(...expandPriorMonth(month, -(all.length - index), asOf));
  });
  for (const txn of spec.transactions ?? []) {
    transactions.push(makeTransaction(txn, asOf));
  }

  const accounts: EngineAccount[] = (spec.accounts ?? [{ balance: 62_000, availableBalance: 62_000 }]).map(
    (a, index) => ({
      id: `acct_${index}`,
      type: a.type ?? 'SAVINGS',
      balance: a.balance ?? 0,
      availableBalance: a.availableBalance ?? a.balance ?? 0,
      isLiability: a.isLiability ?? false,
      isEmergencyFund: a.isEmergencyFund ?? false,
      currency: 'INR',
    }),
  );

  const budget: EngineBudget | null = (spec.withBudget ?? true)
    ? {
        id: 'budget_1',
        strategy,
        periodStart: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)).toISOString(),
        periodEnd: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)).toISOString(),
        monthlyIncome,
        needsPercent: preset.needsPercent,
        wantsPercent: preset.wantsPercent,
        savingsPercent: preset.savingsPercent,
        investmentsPercent: preset.investmentsPercent,
        debtPercent: preset.debtPercent,
        allocations: (spec.allocations ?? []).map((a) => ({
          categoryKey: a.categoryKey,
          categoryKind: categoryKind(a.categoryKey),
          allocated: a.allocated,
        })),
        rules: spec.rules ?? [],
      }
    : null;

  return {
    userId: 'user_test',
    asOf: asOf.toISOString(),
    currency: 'INR',
    accounts,
    transactions,
    budget,
    recurringObligations: (spec.obligations ?? []).map((o) => ({
      label: o.label,
      amount: o.amount,
      dueDay: o.dueDay,
      categoryKey: o.categoryKey,
      categoryKind: categoryKind(o.categoryKey),
    })),
    emergencyFundTargetMonths: spec.emergencyFundTargetMonths ?? 6,
    emergencyReserveAmount: spec.emergencyReserveAmount ?? null,
    monthlyDebtPayments: spec.monthlyDebtPayments ?? 0,
    totalDebtOutstanding: spec.totalDebtOutstanding ?? 0,
    declaredMonthlyIncome: spec.declaredMonthlyIncome ?? monthlyIncome,
    savingsGoals: spec.savingsGoals ?? [],
    investmentContributionsThisMonth: spec.investmentContributionsThisMonth ?? 0,
    portfolioValue: spec.portfolioValue ?? 0,
  };
}

/**
 * The scenario from the product spec: Shaun, ₹75,000/month, ₹62,000 in the
 * account, ₹54,000 of it protected as an emergency reserve, ₹12,000 of
 * discretionary budget left and ₹20,000 of bills still to pay.
 */
export function shaunContext(): EngineContext {
  return makeContext({
    asOf: '2026-03-15T12:00:00.000Z',
    monthlyIncome: 75_000,
    accounts: [{ balance: 62_000, availableBalance: 62_000 }],
    priorMonths: [
      { income: 75_000, essential: 34_000, discretionary: 20_000, savings: 14_000 },
      { income: 75_000, essential: 33_000, discretionary: 21_500, savings: 15_000 },
      { income: 75_000, essential: 35_000, discretionary: 19_000, savings: 16_000 },
    ],
    transactions: [
      { amount: 75_000, categoryKey: 'salary', day: 1 },
      { amount: 9_000, categoryKey: 'savings', day: 2 },
      { amount: 6_200, categoryKey: 'groceries', day: 4, merchantName: 'BigBasket' },
      { amount: 3_100, categoryKey: 'utilities', day: 6, merchantName: 'Tata Power', isRecurring: true },
      { amount: 2_400, categoryKey: 'transport', day: 7, merchantName: 'Uber' },
      { amount: 4_500, categoryKey: 'dining', day: 8, merchantName: 'Swiggy' },
      { amount: 3_800, categoryKey: 'shopping', day: 11, merchantName: 'Myntra' },
      { amount: 2_200, categoryKey: 'entertainment', day: 13, merchantName: 'BookMyShow' },
    ],
    obligations: [
      { label: 'Rent', amount: 18_000, dueDay: 28, categoryKey: 'housing' },
      { label: 'Subscriptions', amount: 2_000, dueDay: 25, categoryKey: 'subscriptions' },
    ],
    emergencyReserveAmount: 54_000,
  });
}

/**
 * The healthy scenario from the testing section: ₹100,000 balance, ₹10,000 of
 * upcoming obligations, a ₹30,000 reserve and ₹25,000 of discretionary room.
 */
export function healthyContext(): EngineContext {
  return makeContext({
    asOf: '2026-03-15T12:00:00.000Z',
    monthlyIncome: 90_000,
    accounts: [{ balance: 100_000, availableBalance: 100_000 }],
    priorMonths: [
      { income: 90_000, essential: 38_000, discretionary: 18_000, savings: 25_000, investment: 8_000 },
      { income: 90_000, essential: 37_000, discretionary: 19_000, savings: 24_000, investment: 8_000 },
      { income: 90_000, essential: 39_000, discretionary: 17_500, savings: 26_000, investment: 8_000 },
    ],
    transactions: [
      { amount: 90_000, categoryKey: 'salary', day: 1 },
      { amount: 25_000, categoryKey: 'savings', day: 2 },
      { amount: 8_000, categoryKey: 'investments', day: 2 },
      { amount: 5_000, categoryKey: 'groceries', day: 5, merchantName: 'DMart' },
      { amount: 2_000, categoryKey: 'dining', day: 9, merchantName: 'Zomato' },
    ],
    obligations: [{ label: 'Utilities', amount: 10_000, dueDay: 26, categoryKey: 'utilities' }],
    emergencyReserveAmount: 30_000,
    allocations: [
      { categoryKey: 'dining', allocated: 9_000 },
      { categoryKey: 'shopping', allocated: 10_000 },
      { categoryKey: 'entertainment', allocated: 5_000 },
      { categoryKey: 'subscriptions', allocated: 3_000 },
    ],
  });
}
