const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sliding-window rate limiter: at most `limit` calls start per `windowMs`; callers queue in order. */
export class RateLimiter {
  private started: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
  ) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const slot = this.queue.then(() => this.acquire());
    this.queue = slot.catch(() => undefined);
    return slot.then(fn);
  }

  private async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.started = this.started.filter((t) => now - t < this.windowMs);
      if (this.started.length < this.limit) {
        this.started.push(now);
        return;
      }
      await sleep(this.windowMs - (now - this.started[0]!));
    }
  }
}
