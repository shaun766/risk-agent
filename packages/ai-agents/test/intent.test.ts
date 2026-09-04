import { describe, expect, it } from 'vitest';
import { Intent } from '@flowmoney/shared-types';
import { classifyIntent, extractAmount, inferCategory } from '../src/intent';

describe('amount extraction', () => {
  it('parses the formats people actually type', () => {
    expect(extractAmount('Can I buy a ₹18,000 phone?')).toBe(18_000);
    expect(extractAmount('can i spend 12000 on concert tickets')).toBe(12_000);
    expect(extractAmount('is a 50k laptop a good idea')).toBe(50_000);
    expect(extractAmount('should I buy a 1.5 lakh bike')).toBe(150_000);
    expect(extractAmount('Rs. 2,50,000 for a car')).toBe(250_000);
    expect(extractAmount('thinking about a 2 crore house')).toBe(20_000_000);
  });

  it('parses spelled-out amounts', () => {
    expect(extractAmount('a PS5 for fifty thousand')).toBe(50_000);
    expect(extractAmount('about two lakh rupees')).toBe(200_000);
  });

  it('ignores small bare integers that are not prices', () => {
    expect(extractAmount('how did I do in the last 3 months')).toBeNull();
    expect(extractAmount('show me my top 5 merchants')).toBeNull();
  });

  it('returns null when there is no amount at all', () => {
    expect(extractAmount('how am I doing financially')).toBeNull();
  });
});

describe('category inference', () => {
  it('maps everyday phrasing onto budget categories', () => {
    expect(inferCategory('thinking of buying a PS5')).toBe('shopping');
    expect(inferCategory('a trip to Goa next month')).toBe('travel');
    expect(inferCategory('dinner at a nice restaurant')).toBe('dining');
    expect(inferCategory('concert tickets')).toBe('entertainment');
    expect(inferCategory('a Netflix subscription')).toBe('subscriptions');
    expect(inferCategory('an online course')).toBe('education');
  });
});

describe('intent classification', () => {
  const cases: Array<[string, Intent]> = [
    ['Can I buy a ₹18,000 phone?', Intent.PURCHASE_ANALYSIS],
    ['should I get a PS5 for 50000', Intent.PURCHASE_ANALYSIS],
    ['How much did I spend this month?', Intent.MONTHLY_FINANCIAL_SUMMARY],
    ['Why am I always broke?', Intent.FINANCIAL_BEHAVIOR_ANALYSIS],
    ['How can I save more?', Intent.SAVINGS_OPTIMIZATION],
    ['Where should I put my extra ₹20,000?', Intent.CASH_ALLOCATION_GUIDANCE],
    ['Explain mutual funds to me', Intent.INVESTMENT_EDUCATION],
    ['Am I over budget on dining?', Intent.BUDGET_MANAGEMENT],
    ['What is my financial health score?', Intent.FINANCIAL_HEALTH],
    ['There is a suspicious charge on my card', Intent.ANOMALY_CHECK],
    ['proceed', Intent.PAYMENT_AUTHORIZATION],
    ['hey', Intent.GREETING],
  ];

  for (const [message, expected] of cases) {
    it(`routes "${message}" to ${expected}`, () => {
      const result = classifyIntent(message);
      expect(result.intent).toBe(expected);
      expect(result.confidence).toBeGreaterThan(0.3);
    });
  }

  it('extracts a structured purchase for purchase intents', () => {
    const result = classifyIntent('Can I afford a ₹18,000 phone?');
    expect(result.purchase).not.toBeNull();
    expect(result.purchase?.price).toBe(18_000);
    expect(result.purchase?.category).toBe('shopping');
    expect(result.purchase?.isRecurring).toBe(false);
  });

  it('detects a recurring commitment', () => {
    const result = classifyIntent('should I buy a 2000 per month gym membership');
    expect(result.purchase?.isRecurring).toBe(true);
    expect(result.purchase?.monthlyCost).toBe(2_000);
  });

  it('reads necessity from the wording', () => {
    expect(classifyIntent('I need to replace my broken 30000 laptop').purchase?.importance).toBe(5);
    expect(classifyIntent('can I buy a 5000 impulse gadget').purchase?.importance).toBe(1);
  });

  it('does not guess wildly on an empty or meaningless message', () => {
    expect(classifyIntent('').intent).toBe(Intent.UNKNOWN);
    expect(classifyIntent('asdfghjkl').intent).toBe(Intent.GENERAL_QUESTION);
  });
});
