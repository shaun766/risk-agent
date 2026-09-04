/**
 * Deterministic PRNG (mulberry32). The seed is reproducible across machines and
 * runs, so demo screenshots, tests and support conversations all reference the
 * same data.
 */
export function createRng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Uniform float in [min, max). */
    float: (min: number, max: number) => min + next() * (max - min),
    /** Uniform integer in [min, max]. */
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    /** Random element of a non-empty array. */
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    /** True with probability p. */
    chance: (p: number) => next() < p,
    /** Jitter a value by ±spread (0.1 = ±10%). */
    jitter: (value: number, spread: number) => value * (1 + (next() * 2 - 1) * spread),
  };
}

export type Rng = ReturnType<typeof createRng>;

/** Round to whole rupees — seeded data should look like real statements. */
export function money(value: number): number {
  return Math.round(value);
}
