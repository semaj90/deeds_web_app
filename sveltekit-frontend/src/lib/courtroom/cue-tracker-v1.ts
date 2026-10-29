/**
 * Tracks one pending awaitable cue (an animation or a move) per actor key so the story engine can `await` it.
 * Starting a new cue for the same key settles the previous one as `interrupted`, so a stale awaiter never hangs.
 * Every cue also carries a timeout so a clip that never reports completion cannot stall the story.
 */
export type CueOutcome = 'finished' | 'interrupted' | 'timeout' | 'unavailable';

interface Pending {
	settle: (outcome: CueOutcome) => void;
	timer: ReturnType<typeof setTimeout> | null;
}

export class CueTracker {
	private pending = new Map<string, Pending>();

	begin(key: string, timeoutMs: number): Promise<CueOutcome> {
		this.settle(key, 'interrupted');
		return new Promise<CueOutcome>((resolve) => {
			const timer = Number.isFinite(timeoutMs) && timeoutMs > 0 ? setTimeout(() => this.settle(key, 'timeout'), timeoutMs) : null;
			this.pending.set(key, { settle: resolve, timer });
		});
	}

	settle(key: string, outcome: CueOutcome): boolean {
		const p = this.pending.get(key);
		if (!p) return false;
		this.pending.delete(key);
		if (p.timer) clearTimeout(p.timer);
		p.settle(outcome);
		return true;
	}

	isPending(key: string): boolean {
		return this.pending.has(key);
	}

	/** Settle everything (scene disposal). */
	settleAll(outcome: CueOutcome = 'interrupted'): void {
		for (const key of [...this.pending.keys()]) this.settle(key, outcome);
	}
}
