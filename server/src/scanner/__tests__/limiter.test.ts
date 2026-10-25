import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../limiter.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RateLimiter', () => {
  it('runs up to N calls per window immediately and delays the rest', async () => {
    const limiter = new RateLimiter(2, 1000);
    const started: number[] = [];
    const t0 = Date.now();
    const run = (i: number) => limiter.run(async () => started.push(Date.now() - t0) && i);
    const all = Promise.all([run(1), run(2), run(3)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 0]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await all).toEqual([1, 2, 3]);
    expect(started[2]).toBeGreaterThanOrEqual(1000);
  });

  it('passes errors through without blocking later calls', async () => {
    const limiter = new RateLimiter(5, 1000);
    await expect(limiter.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await limiter.run(async () => 'ok')).toBe('ok');
  });
});
