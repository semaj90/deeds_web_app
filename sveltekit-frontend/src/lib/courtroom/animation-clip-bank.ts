/**
 * N64-style animation bank: a small, bounded set of resident animation clips with pinned slots
 * and LRU eviction. Loader and disposer are injected so the bank has no Babylon/Three dependency
 * and is testable without a GPU. A pinned or in-use clip is never evicted.
 */

export interface AnimationClipBankOptions<T> {
	/** Maximum resident clips, pinned included. */
	maxResident: number;
	/** Clip names that stay resident once loaded (for example `idle`, `speaking`). */
	pinned?: readonly string[];
	load: (name: string) => Promise<T>;
	/** Called when a clip leaves the bank so the caller can release its buffers. */
	dispose?: (name: string, clip: T) => void;
}

export class AnimationClipBank<T> {
	private readonly resident = new Map<string, T>(); // insertion order = LRU order (oldest first)
	private readonly pending = new Map<string, Promise<T>>();
	private readonly inUse = new Map<string, number>();
	private readonly pinned: ReadonlySet<string>;

	constructor(private readonly opts: AnimationClipBankOptions<T>) {
		if (!Number.isInteger(opts.maxResident) || opts.maxResident < 1) {
			throw new RangeError('maxResident must be a positive integer');
		}
		this.pinned = new Set(opts.pinned ?? []);
		if (this.pinned.size > opts.maxResident) {
			throw new RangeError('more pinned clips than maxResident');
		}
	}

	get residentNames(): string[] {
		return [...this.resident.keys()];
	}

	/** Load (or reuse) a clip and mark it in use until the returned `release` is called. */
	async acquire(name: string): Promise<{ clip: T; release: () => void }> {
		const clip = await this.get(name);
		this.inUse.set(name, (this.inUse.get(name) ?? 0) + 1);
		let released = false;
		return {
			clip,
			release: () => {
				if (released) return;
				released = true;
				const n = (this.inUse.get(name) ?? 1) - 1;
				if (n <= 0) this.inUse.delete(name);
				else this.inUse.set(name, n);
				this.evict();
			},
		};
	}

	async get(name: string): Promise<T> {
		const hit = this.resident.get(name);
		if (hit !== undefined) {
			this.resident.delete(name);
			this.resident.set(name, hit); // refresh recency
			return hit;
		}
		const inflight = this.pending.get(name);
		if (inflight) return inflight;
		const p = this.opts
			.load(name)
			.then((clip) => {
				this.resident.set(name, clip);
				this.evict(name);
				return clip;
			})
			.finally(() => this.pending.delete(name));
		this.pending.set(name, p);
		return p;
	}

	/** Start loading a clip without waiting; failures are swallowed (prefetch is best effort). */
	prefetch(name: string): void {
		void this.get(name).catch(() => undefined);
	}

	dispose(): void {
		for (const [name, clip] of this.resident) this.opts.dispose?.(name, clip);
		this.resident.clear();
		this.inUse.clear();
	}

	private evict(justLoaded?: string): void {
		while (this.resident.size > this.opts.maxResident) {
			const victim = [...this.resident.keys()].find(
				(n) => n !== justLoaded && !this.pinned.has(n) && !this.inUse.has(n),
			);
			if (victim === undefined) return; // everything is pinned or in use: allow temporary overshoot
			const clip = this.resident.get(victim) as T;
			this.resident.delete(victim);
			this.opts.dispose?.(victim, clip);
		}
	}
}
