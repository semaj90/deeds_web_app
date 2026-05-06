/**
 * ChunkStreamPipeline — multi-core file indexing pipeline.
 *
 * Processes an async stream of files through 5 CPU-bound stages
 * (hash → chunk → metadata → entity → qdrant-payload) in parallel,
 * then batch-writes results to Redis, Postgres, and Qdrant.
 *
 * Stage isolation:
 *   CPU-bound (workers):  hash, chunk, metadata, entity, payload building
 *   I/O-bound (main):     Qdrant upsert, Postgres insert, Redis pipeline
 *
 * Backpressure:
 *   maxInFlightFiles  = 64   → limits concurrent file-preparation tasks
 *   maxInFlightChunks = 2048 → limits chunks awaiting embedding / Qdrant write
 *
 * Usage:
 *   const gen = runChunkStreamPipeline(files, {
 *     onEmbedChunks: async (payloads) => { ... embed + upsert to Qdrant ... },
 *     onWriteMetadata: async (rows) => { ... bulk insert to Postgres ... },
 *     onCacheKeys: async (keys) => { ... redis pipeline ... },
 *     onProgress: (s) => console.log(s),
 *   });
 *   for await (const stats of gen) { ... report progress ... }
 */

import { BoundedQueue } from './bounded-queue.js';
import { BatchWriter } from './batch-writer.js';
import { getIndexWorkerPool, type QdrantPayloadRecord, type MetadataResult } from '../workers/index-worker-pool.js';

// ── public types ─────────────────────────────────────────────────────────

export interface PipelineFile {
	/** Absolute or relative path (used for metadata + payload fields). */
	filePath: string;
	/** Full text content of the file. */
	text: string;
}

export interface PipelineStats {
	filesProcessed: number;
	chunksProduced: number;
	payloadsQueued: number;
	writesCompleted: number;
	errors: number;
	elapsedMs: number;
}

export interface PipelineOptions {
	/** Max files being prepared concurrently (default 64). */
	maxInFlightFiles?: number;
	/** Max chunk payloads waiting to be written (default 2048). */
	maxInFlightChunks?: number;

	// ── batch sizes ────────────────────────────────────────────────────
	qdrantBatchSize?: number;     // default 128
	postgresBatchSize?: number;   // default 500
	redisPipelineSize?: number;   // default 250

	// ── write callbacks (optional — omit to skip that tier) ──────────
	/**
	 * Called with a batch of prepared payload objects.
	 * Caller is responsible for embedding + Qdrant upsert.
	 * If omitted, payloads are counted but not written anywhere.
	 */
	onEmbedChunks?: (payloads: QdrantPayloadRecord[]) => Promise<void>;

	/**
	 * Called with a batch of (filePath, metadata) pairs for Postgres storage.
	 * Omit to skip DB metadata writes.
	 */
	onWriteMetadata?: (rows: Array<{ filePath: string; metadata: MetadataResult }>) => Promise<void>;

	/**
	 * Called with a batch of Redis set operations: { key, value, ttlSecs }.
	 * Used for content-hash dedup cache and fast-lookup keys.
	 */
	onCacheKeys?: (entries: Array<{ key: string; value: string; ttlSecs: number }>) => Promise<void>;

	/** Progress callback — called after each file completes. */
	onProgress?: (stats: PipelineStats) => void;

	/** Chunk size in lines (default 80). */
	maxLines?: number;
	/** Overlap between chunks in lines (default 10). */
	overlap?: number;
}

// ── pipeline ──────────────────────────────────────────────────────────────

export async function* runChunkStreamPipeline(
	files: AsyncIterable<PipelineFile> | PipelineFile[],
	opts: PipelineOptions = {},
): AsyncGenerator<PipelineStats> {
	const maxInFlightFiles  = opts.maxInFlightFiles  ?? 64;
	const maxInFlightChunks = opts.maxInFlightChunks ?? 2048;
	const qdrantBatchSize   = opts.qdrantBatchSize   ?? 128;
	const postgresBatchSize = opts.postgresBatchSize  ?? 500;
	const redisPipelineSize = opts.redisPipelineSize  ?? 250;

	const pool       = getIndexWorkerPool();
	const fileQueue  = new BoundedQueue(maxInFlightFiles);
	const chunkQueue = new BoundedQueue(maxInFlightChunks);

	const stats: PipelineStats = {
		filesProcessed: 0,
		chunksProduced: 0,
		payloadsQueued: 0,
		writesCompleted: 0,
		errors: 0,
		elapsedMs: 0,
	};
	const startMs = Date.now();

	// ── batch writers ──────────────────────────────────────────────────

	const qdrantWriter = new BatchWriter<QdrantPayloadRecord>({
		batchSize:       qdrantBatchSize,
		flushIntervalMs: 400,
		onFlush: async (batch) => {
			await opts.onEmbedChunks?.(batch);
			stats.writesCompleted += batch.length;
		},
		onError: (err) => {
			console.error('[chunk-stream-pipeline] qdrant flush error', err);
			stats.errors++;
		},
	});

	const metaWriter = new BatchWriter<{ filePath: string; metadata: MetadataResult }>({
		batchSize:       postgresBatchSize,
		flushIntervalMs: 800,
		onFlush: async (batch) => { await opts.onWriteMetadata?.(batch); },
		onError: (err) => {
			console.error('[chunk-stream-pipeline] metadata flush error', err);
			stats.errors++;
		},
	});

	const cacheWriter = new BatchWriter<{ key: string; value: string; ttlSecs: number }>({
		batchSize:       redisPipelineSize,
		flushIntervalMs: 600,
		onFlush: async (batch) => { await opts.onCacheKeys?.(batch); },
		onError: (err) => {
			console.error('[chunk-stream-pipeline] cache flush error', err);
			stats.errors++;
		},
	});

	// ── file processing loop ───────────────────────────────────────────

	// Collect promises so we can await all concurrent tasks at the end
	const filePromises: Promise<void>[] = [];

	const fileIterable: AsyncIterable<PipelineFile> = Array.isArray(files)
		? (async function* () { for (const f of files) yield f; })()
		: files;

	for await (const file of fileIterable) {
		// Wait for a file slot — this is the main backpressure point
		const p = fileQueue.wrap(async () => {
			try {
				const { hash, chunks, metadata, entities } = await pool.prepareFile(
					file.text,
					file.filePath,
					{ maxLines: opts.maxLines, overlap: opts.overlap },
				);

				stats.filesProcessed++;
				stats.chunksProduced += chunks.length;

				// Queue each chunk payload through the chunk backpressure gate
				const chunkOps = chunks.map((payload) =>
					chunkQueue.wrap(async () => {
						qdrantWriter.add(payload);
						stats.payloadsQueued++;
					}),
				);
				await Promise.all(chunkOps);

				// Write metadata row to Postgres
				metaWriter.add({ filePath: file.filePath, metadata });

				// Write dedup + fast-lookup keys to Redis
				cacheWriter.add({
					key: `index:hash:${hash}`,
					value: JSON.stringify({ filePath: file.filePath, lineCount: metadata.lineCount }),
					ttlSecs: 86400 * 7, // 7 days
				});

				// Tag entities as a Redis set for fast lookup (fire-and-forget, best effort)
				if (entities.entities.length > 0) {
					cacheWriter.add({
						key: `index:entities:${file.filePath}`,
						value: JSON.stringify(entities.entities.map((e) => ({ type: e.type, text: e.text }))),
						ttlSecs: 86400 * 7,
					});
				}

				stats.elapsedMs = Date.now() - startMs;
				opts.onProgress?.(Object.assign({}, stats));
			} catch (err) {
				stats.errors++;
				console.error(`[chunk-stream-pipeline] error processing ${file.filePath}:`, err);
			}
		});
		filePromises.push(p);

		// Yield progress every 16 files so callers can stream SSE updates
		if (filePromises.length % 16 === 0) {
			stats.elapsedMs = Date.now() - startMs;
			yield Object.assign({}, stats);
		}
	}

	// Wait for all in-flight file tasks to finish
	await Promise.all(filePromises);

	// Drain all batch writers (flushes remaining items, stops timers)
	await Promise.all([qdrantWriter.drain(), metaWriter.drain(), cacheWriter.drain()]);

	stats.elapsedMs = Date.now() - startMs;
	yield Object.assign({}, stats);
}
