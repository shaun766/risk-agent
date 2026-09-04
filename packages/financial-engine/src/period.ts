/**
 * Calendar helpers. Everything the engine does is anchored to a calendar month
 * in the user's own timezone-naive local date space — we deliberately avoid
 * timezone maths inside scoring so a decision is reproducible from stored data.
 */

export interface Period {
  start: Date;
  end: Date;
  /** YYYY-MM */
  key: string;
  totalDays: number;
  /** Days consumed including today (1-based). */
  daysElapsed: number;
  daysRemaining: number;
  currentDay: number;
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function daysInMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function parseMonthKey(key: string): Date {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) throw new RangeError(`Invalid month key: ${key}`);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

export function buildPeriod(asOf: Date): Period {
  const start = startOfMonth(asOf);
  const end = endOfMonth(asOf);
  const totalDays = daysInMonth(asOf);
  const currentDay = asOf.getUTCDate();
  // `daysElapsed` is never 0 — day 1 counts as one elapsed day so per-day
  // burn-rate maths never divides by zero.
  const daysElapsed = Math.min(Math.max(currentDay, 1), totalDays);
  return {
    start,
    end,
    key: monthKeyOf(asOf),
    totalDays,
    daysElapsed,
    daysRemaining: Math.max(totalDays - daysElapsed, 0),
    currentDay,
  };
}

export function isWithin(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Date of a given day-of-month within the period, clamped to the month length. */
export function dayInPeriod(period: Period, dayOfMonth: number): Date {
  const day = Math.min(Math.max(dayOfMonth, 1), period.totalDays);
  return new Date(
    Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth(), day, 12, 0, 0, 0),
  );
}

export function toISODate(date: Date): string {
  return date.toISOString();
}

export function differenceInDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** Inclusive list of the N month keys ending at (and including) `asOf`. */
export function trailingMonthKeys(asOf: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(monthKeyOf(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i, 1))));
  }
  return keys;
}
