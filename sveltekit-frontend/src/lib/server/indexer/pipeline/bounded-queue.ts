/**
 * BoundedQueue — async concurrency limiter with backpressure.
 *
 * Keeps at most `maxInFlight` async operations running simultaneously.
 * Additional callers wait in a FIFO queue until a slot opens.
 *
 * Usage:
 *   const fileQueue = new BoundedQueue(64);   // max 64 files in parallel
 *   await fileQueue.wrap(() => processFile(f));
 */
export class BoundedQueue {
	private inFlight = 0;
	private waiters: Array<() => void> = [];

	constructor(readonly maxInFlight: number) {}

	/** Acquire a slot (waits if at capacity). */
	acquire(): Promise<void> {
		if (this.inFlight < this.maxInFlight) {
			this.inFlight++;
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.waiters.push(() => { this.inFlight++; resolve(); });
		});
	}

	/** Release a slot (wakes the next waiter). */
	release(): void {
		this.inFlight = Math.max(0, this.inFlight - 1);
		const next = this.waiters.shift();
		if (next) next();
	}

	/** Run `fn` within a slot — acquires before, releases after (even on throw). */
	async wrap<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}

	get pending(): number { return this.waiters.length; }
	get active(): number  { return this.inFlight; }
}