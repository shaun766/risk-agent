import { FinancialProductType, LiquidityLevel, AllocationBucket } from '@flowmoney/shared-types';

export const BANKS = [
  { name: 'Meridian Bank', code: 'MRDN', providerKey: 'mock' },
  { name: 'Kaveri Cooperative Bank', code: 'KVRI', providerKey: 'mock' },
  { name: 'Northline Digital Bank', code: 'NLDB', providerKey: 'mock' },
];

/** Merchants keyed by the category they normally settle into. */
export const MERCHANTS: Record<string, string[]> = {
  groceries: ['BigBasket', 'DMart', 'Nature’s Basket', 'Zepto', 'Reliance Fresh'],
  dining: ['Swiggy', 'Zomato', 'Third Wave Coffee', 'Toit Brewpub', 'Blue Tokai'],
  transport: ['Uber', 'Ola', 'Indian Oil', 'Namma Metro', 'Rapido'],
  entertainment: ['BookMyShow', 'PVR Cinemas', 'Spotify Live', 'Smaaash'],
  shopping: ['Myntra', 'Amazon', 'Croma', 'Decathlon', 'IKEA', 'Nykaa'],
  subscriptions: ['Netflix', 'Spotify', 'Adobe', 'Google One', 'Cult.fit', 'iCloud'],
  utilities: ['Tata Power', 'Airtel Fibre', 'BWSSB', 'Indane Gas'],
  housing: ['Rent — Landlord', 'Society Maintenance'],
  healthcare: ['Apollo Pharmacy', 'Practo', 'Manipal Hospital'],
  insurance: ['HDFC Life', 'Star Health', 'Acko Motor'],
  education: ['Coursera', 'Unacademy', 'Kindle Store'],
  travel: ['IndiGo', 'MakeMyTrip', 'IRCTC', 'Airbnb'],
  personal_care: ['Urban Company', 'Salon Studio', 'Wellness Forever'],
  savings: ['Savings Transfer'],
  investments: ['Groww SIP', 'Zerodha Coin', 'NPS Contribution'],
  debt_repayment: ['Home Loan EMI', 'Car Loan EMI', 'Credit Card Payment'],
  salary: ['Monthly Salary'],
  other_income: ['Freelance Payout', 'Interest Credit', 'Cashback'],
  other: ['Miscellaneous'],
};

export interface ProductSeed {
  name: string;
  type: FinancialProductType;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  liquidity: LiquidityLevel;
  minimumInvestment: number;
  interestRate: number;
  expectedReturnLow: number;
  expectedReturnHigh: number;
  lockInMonths: number;
  bucket: AllocationBucket | null;
  description: string;
  rates?: Array<{ tenureMonths: number; rate: number; minAmount: number }>;
}

/**
 * Illustrative product catalogue. Rates are representative of the Indian retail
 * market and are labelled as illustrative everywhere they surface.
 */
export const PRODUCTS: ProductSeed[] = [
  {
    name: 'Meridian High-Yield Savings',
    type: FinancialProductType.SAVINGS_ACCOUNT,
    riskLevel: 'LOW',
    liquidity: LiquidityLevel.INSTANT,
    minimumInvestment: 0,
    interestRate: 3.5,
    expectedReturnLow: 3,
    expectedReturnHigh: 4,
    lockInMonths: 0,
    bucket: AllocationBucket.EMERGENCY_FUND,
    description:
      'Instant-access savings account. Suitable for an emergency fund where availability matters more than return.',
  },
  {
    name: 'Meridian Liquid Fund',
    type: FinancialProductType.LIQUID_FUND,
    riskLevel: 'LOW',
    liquidity: LiquidityLevel.INSTANT,
    minimumInvestment: 1_000,
    interestRate: 0,
    expectedReturnLow: 5.5,
    expectedReturnHigh: 6.8,
    lockInMonths: 0,
    bucket: AllocationBucket.LIQUID_RESERVE,
    description:
      'Very short duration debt fund. Typically redeemable within one working day, with low but non-zero capital risk.',
  },
  {
    name: 'Meridian Fixed Deposit',
    type: FinancialProductType.FIXED_DEPOSIT,
    riskLevel: 'LOW',
    liquidity: LiquidityLevel.LOW,
    minimumInvestment: 5_000,
    interestRate: 7.1,
    expectedReturnLow: 6.8,
    expectedReturnHigh: 7.4,
    lockInMonths: 12,
    bucket: AllocationBucket.LOW_RISK,
    description: 'Term deposit with a contracted rate. Premature withdrawal carries a penalty.',
    rates: [
      { tenureMonths: 6, rate: 6.5, minAmount: 5_000 },
      { tenureMonths: 12, rate: 7.1, minAmount: 5_000 },
      { tenureMonths: 24, rate: 7.35, minAmount: 10_000 },
      { tenureMonths: 60, rate: 7.5, minAmount: 25_000 },
    ],
  },
  {
    name: 'Meridian Recurring Deposit',
    type: FinancialProductType.RECURRING_DEPOSIT,
    riskLevel: 'LOW',
    liquidity: LiquidityLevel.LOW,
    minimumInvestment: 500,
    interestRate: 6.9,
    expectedReturnLow: 6.5,
    expectedReturnHigh: 7.1,
    lockInMonths: 12,
    bucket: AllocationBucket.GOAL_FUNDING,
    description: 'Fixed monthly contribution towards a dated goal, at a contracted rate.',
  },
  {
    name: 'Northline Short-Duration Debt Fund',
    type: FinancialProductType.DEBT_FUND,
    riskLevel: 'LOW',
    liquidity: LiquidityLevel.MEDIUM,
    minimumInvestment: 2_500,
    interestRate: 0,
    expectedReturnLow: 6.5,
    expectedReturnHigh: 8,
    lockInMonths: 0,
    bucket: AllocationBucket.LOW_RISK,
    description: 'Debt fund holding one to three year paper. More rate-sensitive than a liquid fund.',
  },
  {
    name: 'Northline Nifty 50 Index Fund',
    type: FinancialProductType.INDEX_FUND,
    riskLevel: 'MODERATE',
    liquidity: LiquidityLevel.MEDIUM,
    minimumInvestment: 500,
    interestRate: 0,
    expectedReturnLow: 9,
    expectedReturnHigh: 13,
    lockInMonths: 0,
    bucket: AllocationBucket.LONG_TERM_GROWTH,
    description:
      'Passive equity index fund. Suitable only for money not needed for five or more years; capital value fluctuates.',
  },
  {
    name: 'Kaveri Balanced Advantage Fund',
    type: FinancialProductType.EQUITY_FUND,
    riskLevel: 'MODERATE',
    liquidity: LiquidityLevel.MEDIUM,
    minimumInvestment: 1_000,
    interestRate: 0,
    expectedReturnLow: 8,
    expectedReturnHigh: 12,
    lockInMonths: 0,
    bucket: AllocationBucket.LONG_TERM_GROWTH,
    description: 'Dynamically allocates between equity and debt to soften drawdowns.',
  },
  {
    name: 'Sovereign Gold Bond',
    type: FinancialProductType.GOLD,
    riskLevel: 'MODERATE',
    liquidity: LiquidityLevel.LOW,
    minimumInvestment: 5_000,
    interestRate: 2.5,
    expectedReturnLow: 6,
    expectedReturnHigh: 11,
    lockInMonths: 60,
    bucket: AllocationBucket.LONG_TERM_GROWTH,
    description: 'Gold-linked bond paying a small coupon on top of the metal price.',
  },
  {
    name: 'Public Provident Fund',
    type: FinancialProductType.PPF,
    riskLevel: 'LOW',
    liquidity: LiquidityLevel.LOCKED,
    minimumInvestment: 500,
    interestRate: 7.1,
    expectedReturnLow: 7.1,
    expectedReturnHigh: 7.1,
    lockInMonths: 180,
    bucket: AllocationBucket.LONG_TERM_GROWTH,
    description: 'Long-dated government-backed savings scheme with a fifteen-year lock-in.',
  },
  {
    name: 'Meridian Personal Loan',
    type: FinancialProductType.LOAN,
    riskLevel: 'HIGH',
    liquidity: LiquidityLevel.LOCKED,
    minimumInvestment: 0,
    interestRate: 13.5,
    expectedReturnLow: 0,
    expectedReturnHigh: 0,
    lockInMonths: 0,
    bucket: null,
    description: 'Unsecured personal loan. Shown so the platform can reason about debt cost.',
  },
];
