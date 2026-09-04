import { Intent } from '@flowmoney/shared-types';

export interface ExtractedPurchase {
  price: number | null;
  category: string;
  merchant: string | null;
  description: string;
  isRecurring: boolean;
  monthlyCost: number | null;
  importance: number | null;
}

export interface IntentResult {
  intent: Intent;
  confidence: number;
  matched: string[];
  purchase: ExtractedPurchase | null;
}

// ------------------------------------------------------------ amount parsing

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const WORD_MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  k: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
  million: 1_000_000,
  m: 1_000_000,
};

/**
 * Parses spelled-out amounts such as "fifty thousand" or "one point five lakh".
 * Returns null when the phrase is not a number, so numeric parsing can take over.
 */
function parseWordAmount(text: string): number | null {
  const words = text.toLowerCase().replace(/[,]/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const word of words) {
    const digit = WORD_NUMBERS[word];
    if (digit !== undefined) {
      current += digit;
      sawNumber = true;
      continue;
    }
    const multiplier = WORD_MULTIPLIERS[word];
    if (multiplier !== undefined && sawNumber) {
      if (multiplier >= 1000) {
        total += (current || 1) * multiplier;
        current = 0;
      } else {
        current = (current || 1) * multiplier;
      }
      continue;
    }
    if (word === 'and') continue;
    // Any other token ends the number phrase.
    if (sawNumber && (total > 0 || current > 0)) break;
  }

  const value = total + current;
  return sawNumber && value > 0 ? value : null;
}

const NUMERIC_AMOUNT =
  /(?:₹|rs\.?|inr)?\s*((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?)\s*(k|lakhs?|lacs?|crores?|cr|thousand|million|m)?\b/gi;

/** Extracts the most plausible monetary amount from free text. */
export function extractAmount(text: string): number | null {
  const candidates: number[] = [];

  for (const match of text.matchAll(NUMERIC_AMOUNT)) {
    const raw = (match[1] ?? '').replace(/,/g, '');
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;

    const suffix = (match[2] ?? '').toLowerCase();
    const multiplier =
      suffix === 'k' || suffix === 'thousand'
        ? 1_000
        : suffix.startsWith('lakh') || suffix.startsWith('lac')
          ? 100_000
          : suffix.startsWith('crore') || suffix === 'cr'
            ? 10_000_000
            : suffix === 'million' || suffix === 'm'
              ? 1_000_000
              : 1;

    const scaled = value * multiplier;
    // Bare small integers are usually quantities or dates, not prices — unless
    // they carry a currency marker.
    const hasCurrencyMarker = /(?:₹|rs\.?|inr)\s*$/i.test(text.slice(0, match.index ?? 0)) ||
      /^(?:₹|rs\.?|inr)/i.test(match[0].trim());
    if (scaled < 100 && !hasCurrencyMarker && multiplier === 1) continue;
    candidates.push(scaled);
  }

  if (candidates.length > 0) return Math.max(...candidates);
  return parseWordAmount(text);
}

// ---------------------------------------------------------- category mapping

const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/\b(phone|iphone|laptop|macbook|tv|television|console|ps5|playstation|xbox|headphones?|camera|tablet|ipad|watch|furniture|clothes|shoes|wardrobe|gadget|electronics?)\b/i, 'shopping'],
  [/\b(trip|holiday|vacation|flight|flights|hotel|airbnb|travel|goa|europe|japan)\b/i, 'travel'],
  [/\b(dinner|lunch|restaurant|swiggy|zomato|takeaway|food delivery|brunch|cafe|coffee)\b/i, 'dining'],
  [/\b(concert|tickets?|movie|cinema|gig|festival|show|game night)\b/i, 'entertainment'],
  [/\b(subscription|netflix|spotify|prime|membership|plan)\b/i, 'subscriptions'],
  [/\b(course|certification|class|tuition|book|degree)\b/i, 'education'],
  [/\b(rent|deposit|maintenance|apartment)\b/i, 'housing'],
  [/\b(medicine|doctor|hospital|dental|therapy|insurance premium)\b/i, 'healthcare'],
  [/\b(car|bike|fuel|petrol|cab|scooter|service)\b/i, 'transport'],
  [/\b(groceries|supermarket|vegetables|bigbasket|dmart)\b/i, 'groceries'],
  [/\b(salon|spa|haircut|skincare|gym)\b/i, 'personal_care'],
];

export function inferCategory(text: string): string {
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(text)) return category;
  }
  return 'shopping';
}

// ------------------------------------------------------------ intent rules

interface IntentRule {
  intent: Intent;
  weight: number;
  patterns: RegExp[];
}

const RULES: IntentRule[] = [
  {
    intent: Intent.PAYMENT_AUTHORIZATION,
    weight: 3,
    patterns: [
      /^\s*(proceed|confirm|go ahead|do it|pay now|yes,?\s*(buy|pay|proceed))\b/i,
      /\bauthorise|authorize\b.*\bpayment\b/i,
      /\bconfirm\b.*\bpayment\b/i,
    ],
  },
  {
    intent: Intent.PURCHASE_ANALYSIS,
    weight: 3,
    patterns: [
      /\bcan i (afford|buy|get|spend|splurge)\b/i,
      /\bshould i (buy|get|purchase|spend)\b/i,
      /\b(is it|would it be) (a )?(ok|okay|smart|wise|bad|good)( idea)? to (buy|spend|get)\b/i,
      /\bthinking (of|about) (buying|getting|spending)\b/i,
      /\bworth (buying|it)\b/i,
      /\bafford(able)?\b/i,
      /\bplanning to buy\b/i,
      // Statements of intent, not just questions — people often just announce
      // what they are about to spend money on.
      /\bi (want|need|have) to (buy|get|replace|upgrade|purchase)\b/i,
      /\blooking (to|at) (buy|get|upgrade)\b/i,
      /\bi'?m (buying|getting|purchasing)\b/i,
      /\babout to (buy|spend|purchase)\b/i,
    ],
  },
  {
    intent: Intent.FINANCIAL_BEHAVIOR_ANALYSIS,
    weight: 3,
    patterns: [
      /\bwhy am i (always )?(broke|short|out of money)\b/i,
      /\bwhy (do|does) (i|my money)\b.*\b(run out|disappear|vanish)\b/i,
      /\bspending (habits|patterns|behaviou?r)\b/i,
      /\bwhat am i doing wrong\b/i,
      /\bwhere is my money going\b/i,
    ],
  },
  {
    intent: Intent.CASH_ALLOCATION_GUIDANCE,
    weight: 3,
    patterns: [
      /\bwhere should i (put|park|keep|invest)\b/i,
      /\bwhat should i do with (my )?(extra|spare|surplus|idle)\b/i,
      /\b(idle|spare|surplus|extra) (money|cash|funds?)\b/i,
      /\ballocat(e|ion)\b/i,
    ],
  },
  {
    intent: Intent.SAVINGS_OPTIMIZATION,
    weight: 2,
    patterns: [
      /\bhow (can|do) i save\b/i,
      /\bsave (more|money|better)\b/i,
      /\bcut (down|back)\b/i,
      /\breduce (my )?(spending|expenses|costs)\b/i,
      /\bsaving(s)? (tips|plan|goal)\b/i,
    ],
  },
  {
    intent: Intent.INVESTMENT_EDUCATION,
    weight: 2,
    patterns: [
      /\binvest(ing|ment|ments)?\b/i,
      /\bmutual funds?\b/i,
      /\bsip\b/i,
      /\bstocks?|equit(y|ies)\b/i,
      /\bfixed deposit|\bfd\b/i,
      /\bppf|nps|elss\b/i,
      /\bgold bond\b/i,
      /\breturns?\b.*\brisk\b/i,
    ],
  },
  {
    intent: Intent.MONTHLY_FINANCIAL_SUMMARY,
    weight: 2,
    patterns: [
      /\bhow much (did|have) i spen[dt]\b/i,
      /\bmonthly (report|summary|statement)\b/i,
      /\bthis month('?s)? (spending|summary|report)\b/i,
      /\blast month\b/i,
      /\bwhere did my money go\b/i,
      /\bmy (spending|expenses) (this|last) month\b/i,
    ],
  },
  {
    intent: Intent.BUDGET_MANAGEMENT,
    weight: 2,
    patterns: [
      /\bbudget\b/i,
      /\bover ?spen(d|t|ding)\b/i,
      /\b(spending|category) limit\b/i,
      /\benvelope\b/i,
      /\bhow much (can|should) i spend\b/i,
    ],
  },
  {
    intent: Intent.FINANCIAL_HEALTH,
    weight: 2,
    patterns: [
      /\bfinancial health\b/i,
      /\bhow am i doing\b/i,
      /\bhealth score\b/i,
      /\bam i (doing )?(ok|okay|fine|alright)\b/i,
      /\bfinancially (healthy|stable|secure)\b/i,
    ],
  },
  {
    intent: Intent.ANOMALY_CHECK,
    weight: 3,
    patterns: [
      /\bfraud(ulent)?\b/i,
      /\bsuspicious\b/i,
      /\bunusual (charge|transaction|activity)\b/i,
      /\bi did ?n[o']?t (make|authorise|authorize|recognise|recognize)\b/i,
      /\bunknown (charge|payment|transaction)\b/i,
    ],
  },
  {
    intent: Intent.TRANSACTION_LOOKUP,
    weight: 2,
    patterns: [
      /\b(show|list|recent) .*\btransactions?\b/i,
      /\bdid i pay\b/i,
      /\bhow much (did|have) i (pay|paid) (to|at)\b/i,
      /\blast (\d+ )?(payment|purchase|transaction)s?\b/i,
    ],
  },
  {
    intent: Intent.GREETING,
    weight: 1,
    patterns: [/^\s*(hi|hey|hello|yo|good (morning|afternoon|evening))\b[\s!.,]*$/i],
  },
];

const RECURRING_PATTERN = /\b(per month|a month|monthly|\/month|每|subscription|recurring|every month)\b/i;
const IMPORTANCE_PATTERNS: Array<[RegExp, number]> = [
  [/\b(need|essential|urgent|broken|replace|necessary|must have)\b/i, 5],
  [/\b(important|useful|would help|work)\b/i, 4],
  [/\b(want|like|nice to have|treat)\b/i, 2],
  [/\b(impulse|random|just because|splurge)\b/i, 1],
];

/**
 * Rule-based intent classification.
 *
 * Deterministic on purpose: routing is infrastructure, and a regex that can be
 * unit-tested is preferable to a model call that costs money, adds latency and
 * can drift. The LLM is used for language, not for control flow.
 */
export function classifyIntent(message: string): IntentResult {
  const text = message.trim();
  if (!text) {
    return { intent: Intent.UNKNOWN, confidence: 0, matched: [], purchase: null };
  }

  const scores = new Map<Intent, { score: number; matched: string[] }>();
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (!pattern.test(text)) continue;
      const entry = scores.get(rule.intent) ?? { score: 0, matched: [] };
      entry.score += rule.weight;
      entry.matched.push(pattern.source);
      scores.set(rule.intent, entry);
    }
  }

  const amount = extractAmount(text);

  // An amount alongside buying language is the strongest possible purchase signal.
  if (amount !== null && scores.has(Intent.PURCHASE_ANALYSIS)) {
    const entry = scores.get(Intent.PURCHASE_ANALYSIS)!;
    entry.score += 2;
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const top = ranked[0];

  if (!top) {
    return {
      intent: Intent.GENERAL_QUESTION,
      confidence: 0.3,
      matched: [],
      purchase: null,
    };
  }

  const totalScore = ranked.reduce((sum, [, value]) => sum + value.score, 0);
  const confidence = Math.min(
    0.95,
    Math.max(0.35, (top[1].score / Math.max(totalScore, 1)) * 0.7 + Math.min(top[1].score / 8, 1) * 0.3),
  );

  const purchase =
    top[0] === Intent.PURCHASE_ANALYSIS
      ? {
          price: amount,
          category: inferCategory(text),
          merchant: null,
          description: text.slice(0, 200),
          isRecurring: RECURRING_PATTERN.test(text),
          monthlyCost: RECURRING_PATTERN.test(text) ? amount : null,
          importance:
            IMPORTANCE_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? null,
        }
      : null;

  return { intent: top[0], confidence: Number(confidence.toFixed(2)), matched: top[1].matched, purchase };
}
