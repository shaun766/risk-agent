import { BudgetStrategy, InvestmentHorizon, RiskTolerance } from '@flowmoney/shared-types';

export interface AccountSeed {
  type: 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD' | 'LOAN' | 'FIXED_DEPOSIT' | 'WALLET';
  nickname: string;
  balance: number;
  isPrimary?: boolean;
  isEmergencyFund?: boolean;
  isLiability?: boolean;
  creditLimit?: number;
  bankCode?: string;
}

export interface ObligationSeed {
  label: string;
  amount: number;
  dueDay: number;
  categoryKey: string;
}

export interface GoalSeed {
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  monthsToTarget?: number;
}

export interface HoldingSeed {
  productName: string;
  investedAmount: number;
  currentValue: number;
}

export interface Persona {
  key: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  occupation: string;
  employmentType: string;
  dependents: number;
  /** Gross monthly income credited to the primary account. */
  income: number;
  incomeDay: number;
  /** ±fraction of income variation month to month. 0 for salaried. */
  incomeVolatility: number;
  /** Monthly rupee amounts by category. */
  essential: Record<string, number>;
  discretionary: Record<string, number>;
  savingsMonthly: number;
  investmentMonthly: number;
  debtMonthly: number;
  totalDebtOutstanding: number;
  /** How erratic discretionary spending is, 0.1 = ±10%. */
  volatility: number;
  strategy: BudgetStrategy;
  accounts: AccountSeed[];
  obligations: ObligationSeed[];
  emergencyReserveAmount: number | null;
  emergencyFundTargetMonths: number;
  riskTolerance: RiskTolerance;
  horizon: InvestmentHorizon;
  experienceLevel: 'NONE' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  goals: GoalSeed[];
  holdings: HoldingSeed[];
  whatsappOptIn: boolean;
  /** Explicit current-month behaviour, used to pin the reference scenario. */
  currentMonthOverride?: {
    discretionaryTotal: number;
    savings: number;
    essentialSoFar: Record<string, number>;
  };
  budgetRules?: Array<{ type: 'CATEGORY_MAX' | 'SAVINGS_MIN' | 'TOTAL_SPEND_MAX'; categoryKey: string | null; amount: number; label: string }>;
  notes: string;
}

/**
 * Ten customers with genuinely different financial shapes — salaried savers,
 * variable-income freelancers, an over-spender, a heavily indebted borrower and
 * a student. The engine has to behave sensibly for all of them.
 */
export const PERSONAS: Persona[] = [
  {
    key: 'shaun',
    fullName: 'Shaun Mathew',
    email: 'shaun@flowmoney.dev',
    phone: '+919876500001',
    city: 'Bengaluru',
    occupation: 'Product Designer',
    employmentType: 'SALARIED',
    dependents: 0,
    income: 75_000,
    incomeDay: 1,
    incomeVolatility: 0,
    essential: { housing: 18_000, groceries: 7_500, utilities: 3_200, transport: 3_800, healthcare: 900, insurance: 1_400 },
    discretionary: { dining: 6_500, shopping: 5_800, entertainment: 3_200, subscriptions: 2_000, personal_care: 1_200, travel: 1_800 },
    savingsMonthly: 14_000,
    investmentMonthly: 0,
    debtMonthly: 0,
    totalDebtOutstanding: 0,
    volatility: 0.18,
    strategy: BudgetStrategy.BALANCED,
    accounts: [
      { type: 'SAVINGS', nickname: 'Everyday Savings', balance: 62_000, isPrimary: true, bankCode: 'MRDN' },
      { type: 'CREDIT_CARD', nickname: 'Meridian Rewards Card', balance: 8_400, isLiability: true, creditLimit: 150_000, bankCode: 'MRDN' },
    ],
    obligations: [
      { label: 'Rent', amount: 18_000, dueDay: 28, categoryKey: 'housing' },
      { label: 'Subscriptions', amount: 2_000, dueDay: 25, categoryKey: 'subscriptions' },
    ],
    emergencyReserveAmount: 54_000,
    emergencyFundTargetMonths: 6,
    riskTolerance: RiskTolerance.MODERATE,
    horizon: InvestmentHorizon.MEDIUM,
    experienceLevel: 'BEGINNER',
    goals: [{ name: 'Emergency Fund', targetAmount: 200_000, currentAmount: 54_000, monthlyContribution: 8_000 }],
    holdings: [],
    whatsappOptIn: true,
    currentMonthOverride: {
      discretionaryTotal: 10_500,
      savings: 9_000,
      essentialSoFar: { groceries: 6_200, utilities: 3_100, transport: 2_400 },
    },
    notes: 'The reference scenario from the product specification.',
  },
  {
    key: 'ananya',
    fullName: 'Ananya Rao',
    email: 'ananya@flowmoney.dev',
    phone: '+919876500002',
    city: 'Pune',
    occupation: 'Senior Software Engineer',
    employmentType: 'SALARIED',
    dependents: 0,
    income: 145_000,
    incomeDay: 1,
    incomeVolatility: 0,
    essential: { housing: 32_000, groceries: 11_000, utilities: 4_500, transport: 6_000, healthcare: 1_800, insurance: 3_200 },
    discretionary: { dining: 9_000, shopping: 7_000, entertainment: 4_000, subscriptions: 2_400, travel: 6_000, personal_care: 2_000 },
    savingsMonthly: 25_000,
    investmentMonthly: 28_000,
    debtMonthly: 0,
    totalDebtOutstanding: 0,
    volatility: 0.12,
    strategy: BudgetStrategy.GROWTH_MODE,
    accounts: [
      { type: 'SAVINGS', nickname: 'Salary Account', balance: 148_000, isPrimary: true, bankCode: 'MRDN' },
      { type: 'SAVINGS', nickname: 'Emergency Fund', balance: 340_000, isEmergencyFund: true, bankCode: 'MRDN' },
      { type: 'CREDIT_CARD', nickname: 'Travel Card', balance: 24_000, isLiability: true, creditLimit: 400_000, bankCode: 'NLDB' },
    ],
    obligations: [
      { label: 'Rent', amount: 32_000, dueDay: 3, categoryKey: 'housing' },
      { label: 'Term Insurance', amount: 3_200, dueDay: 10, categoryKey: 'insurance' },
      { label: 'Index Fund SIP', amount: 28_000, dueDay: 5, categoryKey: 'investments' },
    ],
    emergencyReserveAmount: null,
    emergencyFundTargetMonths: 6,
    riskTolerance: RiskTolerance.AGGRESSIVE,
    horizon: InvestmentHorizon.LONG,
    experienceLevel: 'INTERMEDIATE',
    goals: [
      { name: 'House Down Payment', targetAmount: 2_500_000, currentAmount: 620_000, monthlyContribution: 25_000 },
      { name: 'Japan Trip', targetAmount: 250_000, currentAmount: 95_000, monthlyContribution: 8_000 },
    ],
    holdings: [
      { productName: 'Northline Nifty 50 Index Fund', investedAmount: 480_000, currentValue: 561_000 },
      { productName: 'Meridian Fixed Deposit', investedAmount: 200_000, currentValue: 214_200 },
      { productName: 'Sovereign Gold Bond', investedAmount: 100_000, currentValue: 118_500 },
    ],
    whatsappOptIn: true,
    notes: 'High earner with a fully funded emergency reserve and an active portfolio.',
  },
  {
    key: 'vikram',
    fullName: 'Vikram Shetty',
    email: 'vikram@flowmoney.dev',
    phone: '+919876500003',
    city: 'Mangaluru',
    occupation: 'Restaurant Owner',
    employmentType: 'SELF_EMPLOYED',
    dependents: 2,
    income: 95_000,
    incomeDay: 7,
    incomeVolatility: 0.35,
    essential: { housing: 22_000, groceries: 14_000, utilities: 6_800, transport: 5_500, healthcare: 3_200, insurance: 4_100, education: 8_000 },
    discretionary: { dining: 4_000, shopping: 6_500, entertainment: 2_500, subscriptions: 900, travel: 3_000, personal_care: 1_100 },
    savingsMonthly: 8_000,
    investmentMonthly: 4_000,
    debtMonthly: 12_500,
    totalDebtOutstanding: 620_000,
    volatility: 0.3,
    strategy: BudgetStrategy.DEBT_REDUCTION,
    accounts: [
      { type: 'CURRENT', nickname: 'Business Current', balance: 96_000, isPrimary: true, bankCode: 'KVRI' },
      { type: 'SAVINGS', nickname: 'Family Savings', balance: 78_000, bankCode: 'KVRI' },
      { type: 'LOAN', nickname: 'Business Loan', balance: 620_000, isLiability: true, bankCode: 'KVRI' },
    ],
    obligations: [
      { label: 'Rent', amount: 22_000, dueDay: 5, categoryKey: 'housing' },
      { label: 'Business Loan EMI', amount: 12_500, dueDay: 12, categoryKey: 'debt_repayment' },
      { label: 'School Fees', amount: 8_000, dueDay: 15, categoryKey: 'education' },
    ],
    emergencyReserveAmount: 120_000,
    emergencyFundTargetMonths: 9,
    riskTolerance: RiskTolerance.CONSERVATIVE,
    horizon: InvestmentHorizon.SHORT,
    experienceLevel: 'BEGINNER',
    goals: [{ name: 'Clear Business Loan', targetAmount: 620_000, currentAmount: 140_000, monthlyContribution: 12_500 }],
    holdings: [{ productName: 'Meridian Fixed Deposit', investedAmount: 150_000, currentValue: 159_800 }],
    whatsappOptIn: true,
    notes: 'Variable income, two dependents, meaningful debt — the hardest case for cash-flow scoring.',
  },
  {
    key: 'priya',
    fullName: 'Priya Nair',
    email: 'priya@flowmoney.dev',
    phone: '+919876500004',
    city: 'Kochi',
    occupation: 'Business Analyst',
    employmentType: 'SALARIED',
    dependents: 0,
    income: 42_000,
    incomeDay: 1,
    incomeVolatility: 0,
    essential: { housing: 12_000, groceries: 5_500, utilities: 2_200, transport: 2_600, healthcare: 700, insurance: 900 },
    discretionary: { dining: 3_800, shopping: 3_200, entertainment: 1_600, subscriptions: 1_100, personal_care: 800 },
    savingsMonthly: 4_000,
    investmentMonthly: 2_000,
    debtMonthly: 4_800,
    totalDebtOutstanding: 96_000,
    volatility: 0.22,
    strategy: BudgetStrategy.DEBT_REDUCTION,
    accounts: [
      { type: 'SAVINGS', nickname: 'Primary Savings', balance: 28_500, isPrimary: true, bankCode: 'NLDB' },
      { type: 'CREDIT_CARD', nickname: 'Starter Card', balance: 18_600, isLiability: true, creditLimit: 60_000, bankCode: 'NLDB' },
    ],
    obligations: [
      { label: 'Rent', amount: 12_000, dueDay: 5, categoryKey: 'housing' },
      { label: 'Personal Loan EMI', amount: 4_800, dueDay: 8, categoryKey: 'debt_repayment' },
    ],
    emergencyReserveAmount: 25_000,
    emergencyFundTargetMonths: 4,
    riskTolerance: RiskTolerance.CONSERVATIVE,
    horizon: InvestmentHorizon.MEDIUM,
    experienceLevel: 'NONE',
    goals: [{ name: 'Emergency Buffer', targetAmount: 100_000, currentAmount: 22_000, monthlyContribution: 4_000 }],
    holdings: [],
    whatsappOptIn: true,
    budgetRules: [
      { type: 'CATEGORY_MAX', categoryKey: 'dining', amount: 3_500, label: 'Dining maximum' },
      { type: 'SAVINGS_MIN', categoryKey: null, amount: 4_000, label: 'Minimum monthly savings' },
    ],
    notes: 'Early career, thin margins, credit card balance carrying over.',
  },
  {
    key: 'rohan',
    fullName: 'Rohan Gupta',
    email: 'rohan@flowmoney.dev',
    phone: '+919876500005',
    city: 'Gurugram',
    occupation: 'Regional Sales Manager',
    employmentType: 'SALARIED',
    dependents: 3,
    income: 88_000,
    incomeDay: 1,
    incomeVolatility: 0.08,
    essential: { housing: 26_000, groceries: 12_500, utilities: 5_200, transport: 7_800, healthcare: 2_400, insurance: 3_600, education: 6_000 },
    discretionary: { dining: 4_500, shopping: 4_000, entertainment: 2_200, subscriptions: 1_400, travel: 2_000, personal_care: 900 },
    savingsMonthly: 6_000,
    investmentMonthly: 3_000,
    debtMonthly: 21_000,
    totalDebtOutstanding: 1_850_000,
    volatility: 0.15,
    strategy: BudgetStrategy.DEBT_REDUCTION,
    accounts: [
      { type: 'SAVINGS', nickname: 'Salary Account', balance: 54_000, isPrimary: true, bankCode: 'MRDN' },
      { type: 'LOAN', nickname: 'Home Loan', balance: 1_850_000, isLiability: true, bankCode: 'MRDN' },
    ],
    obligations: [
      { label: 'Home Loan EMI', amount: 21_000, dueDay: 5, categoryKey: 'debt_repayment' },
      { label: 'Rent', amount: 26_000, dueDay: 3, categoryKey: 'housing' },
      { label: 'School Fees', amount: 6_000, dueDay: 10, categoryKey: 'education' },
    ],
    emergencyReserveAmount: 60_000,
    emergencyFundTargetMonths: 6,
    riskTolerance: RiskTolerance.CONSERVATIVE,
    horizon: InvestmentHorizon.LONG,
    experienceLevel: 'BEGINNER',
    goals: [{ name: 'Children Education Fund', targetAmount: 1_200_000, currentAmount: 180_000, monthlyContribution: 6_000 }],
    holdings: [{ productName: 'Public Provident Fund', investedAmount: 180_000, currentValue: 196_400 }],
    whatsappOptIn: true,
    notes: 'High fixed obligations; debt-to-income is the dominant risk factor.',
  },
  {
    key: 'meera',
    fullName: 'Dr. Meera Krishnan',
    email: 'meera@flowmoney.dev',
    phone: '+919876500006',
    city: 'Chennai',
    occupation: 'Consultant Physician',
    employmentType: 'SELF_EMPLOYED',
    dependents: 1,
    income: 210_000,
    incomeDay: 3,
    incomeVolatility: 0.18,
    essential: { housing: 45_000, groceries: 16_000, utilities: 7_500, transport: 9_000, healthcare: 3_000, insurance: 8_500 },
    discretionary: { dining: 14_000, shopping: 12_000, entertainment: 6_000, subscriptions: 3_200, travel: 15_000, personal_care: 4_500 },
    savingsMonthly: 30_000,
    investmentMonthly: 45_000,
    debtMonthly: 0,
    totalDebtOutstanding: 0,
    volatility: 0.2,
    strategy: BudgetStrategy.GROWTH_MODE,
    accounts: [
      { type: 'CURRENT', nickname: 'Practice Account', balance: 385_000, isPrimary: true, bankCode: 'MRDN' },
      { type: 'SAVINGS', nickname: 'Emergency Reserve', balance: 600_000, isEmergencyFund: true, bankCode: 'MRDN' },
      { type: 'FIXED_DEPOSIT', nickname: 'FD Ladder', balance: 500_000, bankCode: 'MRDN' },
    ],
    obligations: [
      { label: 'Rent', amount: 45_000, dueDay: 5, categoryKey: 'housing' },
      { label: 'Portfolio SIP', amount: 45_000, dueDay: 7, categoryKey: 'investments' },
      { label: 'Family Health Cover', amount: 8_500, dueDay: 12, categoryKey: 'insurance' },
    ],
    emergencyReserveAmount: null,
    emergencyFundTargetMonths: 6,
    riskTolerance: RiskTolerance.AGGRESSIVE,
    horizon: InvestmentHorizon.LONG,
    experienceLevel: 'ADVANCED',
    goals: [{ name: 'Clinic Expansion', targetAmount: 4_000_000, currentAmount: 1_150_000, monthlyContribution: 45_000 }],
    holdings: [
      { productName: 'Northline Nifty 50 Index Fund', investedAmount: 1_200_000, currentValue: 1_476_000 },
      { productName: 'Kaveri Balanced Advantage Fund', investedAmount: 600_000, currentValue: 678_000 },
      { productName: 'Sovereign Gold Bond', investedAmount: 300_000, currentValue: 351_000 },
      { productName: 'Public Provident Fund', investedAmount: 450_000, currentValue: 492_000 },
    ],
    whatsappOptIn: false,
    notes: 'High income, high discretionary spend, large portfolio — tests the upper end of every scale.',
  },
  {
    key: 'arjun',
    fullName: 'Arjun Desai',
    email: 'arjun@flowmoney.dev',
    phone: '+919876500007',
    city: 'Ahmedabad',
    occupation: 'Graduate Intern',
    employmentType: 'INTERN',
    dependents: 0,
    income: 22_000,
    incomeDay: 5,
    incomeVolatility: 0.05,
    essential: { housing: 6_500, groceries: 3_200, utilities: 900, transport: 1_400, healthcare: 300 },
    discretionary: { dining: 2_800, entertainment: 1_200, subscriptions: 700, shopping: 1_500, personal_care: 400 },
    savingsMonthly: 2_000,
    investmentMonthly: 500,
    debtMonthly: 0,
    totalDebtOutstanding: 0,
    volatility: 0.35,
    strategy: BudgetStrategy.AGGRESSIVE_SAVINGS,
    accounts: [{ type: 'SAVINGS', nickname: 'Student Account', balance: 14_200, isPrimary: true, bankCode: 'NLDB' }],
    obligations: [
      { label: 'PG Rent', amount: 6_500, dueDay: 7, categoryKey: 'housing' },
      { label: 'Subscriptions', amount: 700, dueDay: 20, categoryKey: 'subscriptions' },
    ],
    emergencyReserveAmount: 10_000,
    emergencyFundTargetMonths: 3,
    riskTolerance: RiskTolerance.MODERATE,
    horizon: InvestmentHorizon.LONG,
    experienceLevel: 'NONE',
    goals: [{ name: 'Laptop Upgrade', targetAmount: 70_000, currentAmount: 9_000, monthlyContribution: 2_500 }],
    holdings: [],
    whatsappOptIn: true,
    notes: 'Small absolute numbers; verifies the engine does not assume large balances.',
  },
  {
    key: 'fatima',
    fullName: 'Fatima Sheikh',
    email: 'fatima@flowmoney.dev',
    phone: '+919876500008',
    city: 'Hyderabad',
    occupation: 'Freelance Illustrator',
    employmentType: 'FREELANCE',
    dependents: 1,
    income: 65_000,
    incomeDay: 12,
    incomeVolatility: 0.45,
    essential: { housing: 16_000, groceries: 8_000, utilities: 3_000, transport: 2_800, healthcare: 1_500, insurance: 1_800 },
    discretionary: { dining: 4_200, shopping: 3_600, entertainment: 1_800, subscriptions: 2_600, travel: 2_000, personal_care: 1_000 },
    savingsMonthly: 7_000,
    investmentMonthly: 3_000,
    debtMonthly: 0,
    totalDebtOutstanding: 0,
    volatility: 0.4,
    strategy: BudgetStrategy.AGGRESSIVE_SAVINGS,
    accounts: [
      { type: 'SAVINGS', nickname: 'Freelance Account', balance: 88_000, isPrimary: true, bankCode: 'NLDB' },
      { type: 'SAVINGS', nickname: 'Buffer Fund', balance: 145_000, isEmergencyFund: true, bankCode: 'NLDB' },
    ],
    obligations: [
      { label: 'Rent', amount: 16_000, dueDay: 5, categoryKey: 'housing' },
      { label: 'Creative Suite', amount: 2_600, dueDay: 18, categoryKey: 'subscriptions' },
    ],
    emergencyReserveAmount: null,
    emergencyFundTargetMonths: 9,
    riskTolerance: RiskTolerance.MODERATE,
    horizon: InvestmentHorizon.MEDIUM,
    experienceLevel: 'BEGINNER',
    goals: [{ name: 'Studio Equipment', targetAmount: 300_000, currentAmount: 62_000, monthlyContribution: 7_000 }],
    holdings: [{ productName: 'Northline Short-Duration Debt Fund', investedAmount: 90_000, currentValue: 96_300 }],
    whatsappOptIn: true,
    notes: 'Highly irregular income — cash-flow stability scoring matters most here.',
  },
  {
    key: 'karthik',
    fullName: 'Karthik Iyer',
    email: 'karthik@flowmoney.dev',
    phone: '+919876500009',
    city: 'Coimbatore',
    occupation: 'Secondary School Teacher',
    employmentType: 'SALARIED',
    dependents: 2,
    income: 55_000,
    incomeDay: 1,
    incomeVolatility: 0,
    essential: { housing: 14_000, groceries: 10_000, utilities: 3_400, transport: 3_000, healthcare: 1_800, insurance: 2_200, education: 4_500 },
    discretionary: { dining: 2_600, shopping: 2_800, entertainment: 1_200, subscriptions: 800, personal_care: 700 },
    savingsMonthly: 6_500,
    investmentMonthly: 2_500,
    debtMonthly: 0,
    totalDebtOutstanding: 0,
    volatility: 0.14,
    strategy: BudgetStrategy.BALANCED,
    accounts: [
      { type: 'SAVINGS', nickname: 'Household Account', balance: 46_000, isPrimary: true, bankCode: 'KVRI' },
      { type: 'SAVINGS', nickname: 'Rainy Day', balance: 120_000, isEmergencyFund: true, bankCode: 'KVRI' },
    ],
    obligations: [
      { label: 'Rent', amount: 14_000, dueDay: 4, categoryKey: 'housing' },
      { label: 'Tuition Fees', amount: 4_500, dueDay: 10, categoryKey: 'education' },
    ],
    emergencyReserveAmount: null,
    emergencyFundTargetMonths: 6,
    riskTolerance: RiskTolerance.CONSERVATIVE,
    horizon: InvestmentHorizon.LONG,
    experienceLevel: 'BEGINNER',
    goals: [{ name: 'Family Holiday', targetAmount: 180_000, currentAmount: 48_000, monthlyContribution: 5_000 }],
    holdings: [{ productName: 'Public Provident Fund', investedAmount: 220_000, currentValue: 241_000 }],
    whatsappOptIn: true,
    notes: 'Disciplined middle-income household — the "healthy baseline" case.',
  },
  {
    key: 'nisha',
    fullName: 'Nisha Verma',
    email: 'nisha@flowmoney.dev',
    phone: '+919876500010',
    city: 'Mumbai',
    occupation: 'Product Manager',
    employmentType: 'SALARIED',
    dependents: 0,
    income: 120_000,
    incomeDay: 1,
    incomeVolatility: 0,
    essential: { housing: 42_000, groceries: 9_000, utilities: 4_800, transport: 6_500, healthcare: 1_200, insurance: 2_000 },
    discretionary: { dining: 18_000, shopping: 16_000, entertainment: 7_500, subscriptions: 4_200, travel: 12_000, personal_care: 5_000 },
    savingsMonthly: 3_000,
    investmentMonthly: 0,
    debtMonthly: 9_500,
    totalDebtOutstanding: 240_000,
    volatility: 0.28,
    strategy: BudgetStrategy.BALANCED,
    accounts: [
      { type: 'SAVINGS', nickname: 'Salary Account', balance: 31_000, isPrimary: true, bankCode: 'MRDN' },
      { type: 'CREDIT_CARD', nickname: 'Platinum Card', balance: 96_000, isLiability: true, creditLimit: 350_000, bankCode: 'MRDN' },
    ],
    obligations: [
      { label: 'Rent', amount: 42_000, dueDay: 5, categoryKey: 'housing' },
      { label: 'Card Repayment', amount: 9_500, dueDay: 18, categoryKey: 'debt_repayment' },
      { label: 'Subscriptions', amount: 4_200, dueDay: 22, categoryKey: 'subscriptions' },
    ],
    emergencyReserveAmount: 40_000,
    emergencyFundTargetMonths: 6,
    riskTolerance: RiskTolerance.AGGRESSIVE,
    horizon: InvestmentHorizon.SHORT,
    experienceLevel: 'BEGINNER',
    goals: [{ name: 'Clear Credit Card', targetAmount: 96_000, currentAmount: 12_000, monthlyContribution: 9_500 }],
    holdings: [],
    whatsappOptIn: true,
    budgetRules: [
      { type: 'CATEGORY_MAX', categoryKey: 'dining', amount: 10_000, label: 'Dining maximum' },
      { type: 'CATEGORY_MAX', categoryKey: 'shopping', amount: 8_000, label: 'Shopping maximum' },
      { type: 'TOTAL_SPEND_MAX', categoryKey: null, amount: 95_000, label: 'Total spend cap' },
    ],
    notes: 'Good income, poor margins — the archetype the Budget Coach exists for.',
  },
];

export interface StaffSeed {
  fullName: string;
  email: string;
  phone: string;
  roleKeys: string[];
}

export const STAFF: StaffSeed[] = [
  { fullName: 'Platform Owner', email: 'root@flowmoney.dev', phone: '+919876590001', roleKeys: ['SUPER_ADMIN'] },
  { fullName: 'Divya Menon', email: 'admin@flowmoney.dev', phone: '+919876590002', roleKeys: ['BANK_ADMIN'] },
  { fullName: 'Sanjay Bhatt', email: 'analyst@flowmoney.dev', phone: '+919876590003', roleKeys: ['BANK_ANALYST'] },
  { fullName: 'Ira Kulkarni', email: 'agents@flowmoney.dev', phone: '+919876590004', roleKeys: ['AGENT_ADMIN'] },
  { fullName: 'Leo Fernandes', email: 'wealth@flowmoney.dev', phone: '+919876590005', roleKeys: ['PREMIUM_WEALTH_ADVISOR', 'BANK_ANALYST'] },
];
