import { Prisma } from '@prisma/client';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

/**
 * Prisma returns Decimal instances; the engine and API want plain numbers in
 * major units. Every read of a money column goes through here so a Decimal
 * never leaks into JSON (where it would serialise as an object).
 */
export function toNumber(value: DecimalLike, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = value.toNumber();
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableNumber(value: DecimalLike): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

/** Build a Decimal for writes, rounded to 2dp so the column never truncates. */
export function toDecimal(value: number): Prisma.Decimal {
  const safe = Number.isFinite(value) ? value : 0;
  return new Prisma.Decimal(safe.toFixed(2));
}

/** For ratios/rates stored with more precision than money. */
export function toRateDecimal(value: number, dp = 3): Prisma.Decimal {
  const safe = Number.isFinite(value) ? value : 0;
  return new Prisma.Decimal(safe.toFixed(dp));
}
