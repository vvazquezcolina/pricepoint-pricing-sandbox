import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  _resetRateLimitForTests,
  _config,
} from '../../src/lib/rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    _resetRateLimitForTests();
  });

  it('allows the first request from a new IP', () => {
    const r = checkRateLimit('1.2.3.4');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(_config.MAX_REQUESTS_PER_WINDOW - 1);
  });

  it('decrements remaining on each subsequent request', () => {
    const ip = '1.2.3.4';
    for (let i = 0; i < _config.MAX_REQUESTS_PER_WINDOW; i++) {
      const r = checkRateLimit(ip);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(_config.MAX_REQUESTS_PER_WINDOW - i - 1);
    }
  });

  it('blocks the (MAX+1)-th request inside the window', () => {
    const ip = '1.2.3.4';
    for (let i = 0; i < _config.MAX_REQUESTS_PER_WINDOW; i++) {
      checkRateLimit(ip);
    }
    const blocked = checkRateLimit(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('isolates buckets per IP', () => {
    for (let i = 0; i < _config.MAX_REQUESTS_PER_WINDOW; i++) {
      checkRateLimit('1.1.1.1');
    }
    const blockedFirst = checkRateLimit('1.1.1.1');
    const allowedSecond = checkRateLimit('2.2.2.2');
    expect(blockedFirst.allowed).toBe(false);
    expect(allowedSecond.allowed).toBe(true);
  });

  it('returns a resetAt timestamp inside the configured window', () => {
    const before = Date.now();
    const r = checkRateLimit('3.3.3.3');
    const after = Date.now();
    expect(r.resetAt).toBeGreaterThanOrEqual(before + _config.WINDOW_MS - 50);
    expect(r.resetAt).toBeLessThanOrEqual(after + _config.WINDOW_MS + 50);
  });
});
