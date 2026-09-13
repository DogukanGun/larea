import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('opens after the threshold within the window and closes after openMs', () => {
    let t = 0;
    const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, openMs: 30_000 }, () => t);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen).toBe(true);
    t = 29_999;
    expect(cb.isOpen).toBe(true);
    t = 30_000;
    expect(cb.isOpen).toBe(false);
  });

  it('forgets failures outside the window and on success', () => {
    let t = 0;
    const cb = new CircuitBreaker({ failureThreshold: 2, windowMs: 1000, openMs: 500 }, () => t);
    cb.recordFailure();
    t = 2000;
    cb.recordFailure();
    expect(cb.isOpen).toBe(false);
    cb.recordSuccess();
    cb.recordFailure();
    expect(cb.isOpen).toBe(false);
  });
});
