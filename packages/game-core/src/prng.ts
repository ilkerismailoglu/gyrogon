/**
 * FNV-1a 32-bit string hash helper for deterministic seed initialization.
 */
export function hashSeed(seed: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

/**
 * Deterministic Mulberry32 PRNG.
 * Produces identical sequences across browsers, Node.js, iOS, and Android.
 */
export class Mulberry32 {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  /** Returns a float in [0, 1). */
  nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, maxExclusive). */
  nextInt(min: number, maxExclusive: number): number {
    if (maxExclusive <= min) {
      return min;
    }
    return min + Math.floor(this.nextFloat() * (maxExclusive - min));
  }

  /** Returns true with the given probability in [0, 1]. */
  chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }
}

import { DEFAULT_SIDES, PolygonSides } from './types.js';

/**
 * Returns the canonical daily puzzle seed string for a UTC date (YYYY-MM-DD) and polygon side count.
 */
export function getDailySeed(dateStr?: string, sides: PolygonSides = DEFAULT_SIDES): string {
  const datePart = dateStr ?? new Date().toISOString().slice(0, 10);
  return sides === DEFAULT_SIDES
    ? `HEXACORE-DAILY-${datePart}`
    : `HEXACORE-DAILY-${datePart}-${sides}G`;
}
