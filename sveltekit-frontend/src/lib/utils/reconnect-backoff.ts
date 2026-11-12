/**
 * Client-side SSE reconnect helpers (browser-safe, no server imports).
 *
 * - reconnectDelayMs: exponential backoff with FULL jitter, a floor and a cap. Jitter spreads
 *   clients out so a server or proxy restart is not followed by every tab reconnecting in lockstep.
 * - createEventDeduper: bounded window of recently applied event ids, so a replayed event
 *   (after a reconnect) is applied once.
 *
 * A native EventSource already reconnects by itself and resends Last-Event-ID; only add a manual
 * retry when the connection is terminally CLOSED (readyState === 2), and close the old instance first.
 */

export interface BackoffOptions {
	/** Delay ceiling for attempt 0 (default 1000 ms). */
	baseMs?: number;
	/** Maximum delay ceiling (default 30 000 ms). */
	capMs?: number;
	/** Minimum delay, so jitter can never produce a tight retry loop (default 250 ms). */
	minMs?: number;
	/** Injectable randomness for tests; must return a value in [0, 1). */
	random?: () => number;
}

/** Delay before reconnect attempt `attempt` (0-based): uniform in [minMs, min(capMs, baseMs * 2^attempt)]. */
export function reconnectDelayMs(attempt: number, options: BackoffOptions = {}): number {
	const { baseMs = 1000, capMs = 30_000, minMs = 250, random = Math.random } = options;
	const exponent = Math.min(Math.max(0, Math.floor(attempt)), 20);
	const ceiling = Math.max(minMs, Math.min(capMs, baseMs * 2 ** exponent));
	return Math.max(minMs, Math.floor(random() * ceiling));
}

export interface EventDeduper {
	/** Returns true if `id` was already seen; otherwise records it and returns false. */
	isDuplicate(id: string | null | undefined): boolean;
	clear(): void;
}

/** Remembers the last `maxEntries` ids (oldest evicted first). Events without an id are never duplicates. */
export function createEventDeduper(maxEntries = 500): EventDeduper {
	const seen = new Set<string>();
	return {
		isDuplicate(id) {
			if (!id) return false;
			if (seen.has(id)) return true;
			seen.add(id);
			if (seen.size > maxEntries) {
				const oldest = seen.values().next().value;
				if (oldest !== undefined) seen.delete(oldest);
			}
			return false;
		},
		clear() {
			seen.clear();
		},
	};
}
