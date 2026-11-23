/**
 * Seek coalescer (CASE-SCENE-LIVE-03, video-first editing).
 *
 * Keeps at most one media seek in flight. While a seek is in flight, only the
 * most recent requested target is retained; earlier targets are dropped. When
 * the in-flight seek is acknowledged, the retained target (if any) is returned
 * for dispatch. Pure state, no DOM, no media API, no persistence.
 */

export interface SeekCoalescerV1 {
	/** Returns the time to dispatch now, or null if a seek is already in flight (target retained). */
	request(timeMs: number): number | null;
	/** Marks the in-flight seek complete. Returns the latest retained target to dispatch, or null. */
	acknowledge(): number | null;
	/** Drops any in-flight and pending state (for example on lane switch). */
	cancel(): void;
	readonly inFlight: boolean;
	readonly pending: number | null;
}

function assertTime(timeMs: number): void {
	if (!Number.isFinite(timeMs) || timeMs < 0) {
		throw new RangeError(`SEEK_TIME_INVALID:${timeMs}`);
	}
}

export function createSeekCoalescerV1(): SeekCoalescerV1 {
	let inFlight = false;
	let pending: number | null = null;

	return {
		request(timeMs: number) {
			assertTime(timeMs);
			if (!inFlight) {
				inFlight = true;
				return timeMs;
			}
			pending = timeMs;
			return null;
		},
		acknowledge() {
			if (!inFlight) return null;
			if (pending === null) {
				inFlight = false;
				return null;
			}
			const next = pending;
			pending = null;
			return next;
		},
		cancel() {
			inFlight = false;
			pending = null;
		},
		get inFlight() {
			return inFlight;
		},
		get pending() {
			return pending;
		}
	};
}
