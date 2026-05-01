/**
 * Simple in-memory IP rate limiter.
 *
 * Why in-memory: this is a portfolio demo with low expected traffic. Vercel
 * functions don't share memory across instances, so in extreme abuse cases
 * an attacker could fan out across cold-start boundaries. For real production
 * (Pricepoint scale), this should be a centralized store: Vercel KV, Upstash
 * Redis, or a sliding-window in Postgres.
 *
 * The shape of this module is intentionally swappable: same export signature,
 * different storage. The API route doesn't care.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 5;

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(ip);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      resetAt: now + WINDOW_MS,
    };
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.windowStart + WINDOW_MS,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - existing.count,
    resetAt: existing.windowStart + WINDOW_MS,
  };
}

/** Test-only: reset the rate-limit state. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}

/** Test-only: knobs for assertions. */
export const _config = {
  WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
};
