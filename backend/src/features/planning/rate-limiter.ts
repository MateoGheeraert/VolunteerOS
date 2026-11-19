/**
 * A fixed-window counter per key, in memory. Enough for one backend instance in the pilot; with
 * several instances each counts on its own, so the real limit is a multiple (move it to Postgres
 * or Redis when the backend is scaled out).
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Counts one hit; false once the key used up its window. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  /** Drops expired windows now and then, so the map doesn't grow forever. */
  private sweep(now: number) {
    if (this.hits.size < 1000) return;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}
