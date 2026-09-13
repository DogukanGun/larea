/** Trips after N failures within a window; while open, calls are rejected immediately. */
export class CircuitBreaker {
  private failures: number[] = [];
  private openUntil = 0;

  constructor(
    private readonly options: { failureThreshold: number; windowMs: number; openMs: number },
    private readonly now: () => number = Date.now,
  ) {}

  get isOpen(): boolean {
    return this.now() < this.openUntil;
  }

  recordSuccess(): void {
    this.failures = [];
  }

  recordFailure(): void {
    const t = this.now();
    this.failures = this.failures.filter((f) => t - f < this.options.windowMs);
    this.failures.push(t);
    if (this.failures.length >= this.options.failureThreshold) {
      this.openUntil = t + this.options.openMs;
      this.failures = [];
    }
  }
}
