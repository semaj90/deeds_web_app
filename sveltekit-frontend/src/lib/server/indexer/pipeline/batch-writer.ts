/**
 * BatchWriter — buffers items and flushes in configurable batches.
 *
 * Two flush triggers:
 *  - size:     buffer reaches `batchSize`
 *  - interval: `flushIntervalMs` elapses (prevents stall on low throughput)
 *
 * Usage:
 *   const writer = new BatchWriter<QdrantPoint>({
 *     batchSize: 128,
 *     flushIntervalMs: 500,
 *     onFlush: async (batch) => qdrant.upsert(collection, { points: batch }),
 *   });
 *   writer.add(point);
 *   await writer.drain(); // flush remaining + stop timer
 */
export interface BatchWriterOpts<T> {
	batchSize: number;
	flushIntervalMs: number;
	onFlush: (batch: T[]) => Promise<void>;
	onError?: (err: unknown, batch: T[]) => void;
}

export class BatchWriter<T> {
	private buffer: T[] = [];
	private timer: ReturnType<typeof setInterval> | null = null;
	private flushInProgress: Promise<void> | null = null;
	private draining = false;

	readonly stats = { flushed: 0, errors: 0, itemsWritten: 0 };

	constructor(private readonly opts: BatchWriterOpts<T>) {
		if (opts.flushIntervalMs > 0) {
			this.timer = setInterval(() => { this.flush().catch(() => {}); }, opts.flushIntervalMs);
			// Don't hold the process open for this timer
			if (typeof this.timer?.unref === 'function') this.timer.unref();
		}
	}

	add(item: T): void {
		this.buffer.push(item);
		if (this.buffer.length >= this.opts.batchSize) {
			this.flush().catch(() => {});
		}
	}

	addMany(items: T[]): void {
		for (const item of items) this.add(item);
	}

	async flush(): Promise<void> {
		if (this.buffer.length === 0) return;
		const batch = this.buffer.splice(0, this.opts.batchSize);
		if (batch.length === 0) return;

		// Serialize flushes — never overlap two flushes on the same writer
		this.flushInProgress = (this.flushInProgress ?? Promise.resolve()).then(async () => {
			try {
				await this.opts.onFlush(batch);
				this.stats.flushed++;
				this.stats.itemsWritten += batch.length;
			} catch (err) {
				this.stats.errors++;
				this.opts.onError?.(err, batch);
			}
		});
		await this.flushInProgress;
	}

	/** Flush all remaining items then stop the interval timer. */
	async drain(): Promise<void> {
		if (this.draining) return;
		this.draining = true;
		if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
		// Flush in batches until empty
		while (this.buffer.length > 0) {
			await this.flush();
		}
		// Wait for any in-progress flush to complete
		if (this.flushInProgress) await this.flushInProgress;
	}

	get buffered(): number { return this.buffer.length; }
}
