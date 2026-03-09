/**
 * Circuit Breaker — prevents cascading failures for external services.
 *
 * States: CLOSED (healthy) → OPEN (failing) → HALF_OPEN (probing)
 *
 * Usage:
 *   const result = await ollamaBreaker.call(
 *     () => fetch(url),
 *     () => fallbackValue
 *   );
 */

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerStatus {
	state: BreakerState;
	failures: number;
	lastFailure: number | null;
	lastSuccess: number | null;
}

export class CircuitBreaker {
	private state: BreakerState = 'CLOSED';
	private failures = 0;
	private lastFailure: number | null = null;
	private lastSuccess: number | null = null;

	constructor(
		public readonly name: string,
		private readonly threshold: number = 5,
		private readonly resetTimeoutMs: number = 30_000
	) {}

	getStatus(): BreakerStatus {
		// Auto-transition OPEN → HALF_OPEN after timeout
		if (this.state === 'OPEN' && this.lastFailure) {
			if (Date.now() - this.lastFailure >= this.resetTimeoutMs) {
				this.state = 'HALF_OPEN';
			}
		}
		return {
			state: this.state,
			failures: this.failures,
			lastFailure: this.lastFailure,
			lastSuccess: this.lastSuccess,
		};
	}

	recordSuccess(): void {
		this.failures = 0;
		this.lastSuccess = Date.now();
		this.state = 'CLOSED';
	}

	recordFailure(): void {
		this.failures++;
		this.lastFailure = Date.now();
		if (this.failures >= this.threshold) {
			this.state = 'OPEN';
		}
	}

	isOpen(): boolean {
		const status = this.getStatus();
		return status.state === 'OPEN';
	}

	/**
	 * Execute a function through the circuit breaker.
	 * If the breaker is OPEN, calls fallback immediately.
	 * If HALF_OPEN, allows one probe request.
	 */
	async call<T>(fn: () => Promise<T>, fallback?: () => T | Promise<T>): Promise<T> {
		const status = this.getStatus();

		if (status.state === 'OPEN') {
			if (fallback) return fallback();
			throw new Error(`Circuit breaker [${this.name}] is OPEN (${this.failures} failures)`);
		}

		try {
			const result = await fn();
			this.recordSuccess();
			return result;
		} catch (err) {
			this.recordFailure();
			if (fallback && this.isOpen()) return fallback();
			throw err;
		}
	}
}

// ── Named breakers for infrastructure services ──────────────────────────────
export const ollamaBreaker = new CircuitBreaker('ollama', 5, 30_000);
export const qdrantBreaker = new CircuitBreaker('qdrant', 3, 60_000);
export const redisBreaker = new CircuitBreaker('redis', 3, 30_000);
