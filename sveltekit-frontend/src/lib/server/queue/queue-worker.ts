/**
 * QueueWorker — Typed Base Class for RabbitMQ Consumers
 *
 * Provides a reusable pattern for building strongly-typed message consumers
 * on top of the RabbitMQManager. Each worker declares its queue, message shape,
 * and handler — the base class handles consume lifecycle, ACK/NACK, retries,
 * DLQ routing, and error logging.
 *
 * WorkerRegistry manages all workers with startAll/stopAll/getStats.
 *
 * Usage:
 *   class MyWorker extends QueueWorker<{ documentId: string }> {
 *     queue = 'document.embed' as const;
 *     async process(data) { ... }
 *   }
 *   const worker = new MyWorker();
 *   await worker.start();
 */

type QueueName =
	| 'cache.invalidate'
	| 'document.embed'
	| 'evidence.process'
	| 'vector.index'
	| 'chat.context'
	| 'analytics.track'
	| 'kb.ingest'
	| 'codebase.index';

export interface WorkerStats {
	processed: number;
	failed: number;
	retried: number;
	dlqCount: number;
	avgProcessingMs: number;
	lastProcessedAt: string | null;
	isRunning: boolean;
	readinessState: 'NOT_STARTED' | 'READY' | 'FAILED' | 'DISABLED';
	startError: string | null;
}

/**
 * Abstract base class for typed RabbitMQ queue workers
 * Subclasses implement `queue` and `process(data)`.
 */
export abstract class QueueWorker<TMessage> {
	/** The queue this worker consumes from */
	abstract readonly queue: QueueName;

	/** Maximum retries before dead-lettering (default 3) */
	protected maxRetries = 3;

	/** Concurrency: how many messages to prefetch (default 1) */
	protected prefetch = 1;

	private stats: WorkerStats = {
		processed: 0,
		failed: 0,
		retried: 0,
		dlqCount: 0,
		avgProcessingMs: 0,
		lastProcessedAt: null,
		isRunning: false,
		readinessState: 'NOT_STARTED',
		startError: null
	};

	private totalProcessingMs = 0;
	private stopping = false;
	private inFlightCount = 0;

	/**
	 * Process a single message — implement in subclass
	 * Throw to NACK (requeue). Return normally to ACK.
	 */
	abstract process(data: TMessage): Promise<void>;

	/**
	 * Start consuming messages from the queue
	 * Uses dynamic import to avoid bundling amqplib on client
	 */
	async start(): Promise<void> {
		if (this.stats.isRunning) {
			console.warn(`[Worker:${this.queue}] Already running`);
			return;
		}
		if (this.stats.readinessState === 'DISABLED') return;

		this.stopping = false;
		this.stats.startError = null;

		try {
			const { rabbitmq } = await import('./rabbitmq-manager-fixed.js');

			if (!rabbitmq) {
				throw new Error('RabbitMQ manager not available');
			}

			await rabbitmq.consume(this.queue, async (msg: unknown) => {
				if (this.stopping) return;

				this.inFlightCount++;
				const startMs = performance.now();
				const amqpMsg = msg as {
					content: Buffer;
					fields: { deliveryTag: number; redelivered: boolean };
					properties: { headers?: Record<string, unknown> };
				};

				try {
					const data = JSON.parse(amqpMsg.content.toString()) as TMessage;
					await this.process(data);

					const durationMs = performance.now() - startMs;
					this.stats.processed++;
					this.totalProcessingMs += durationMs;
					this.stats.avgProcessingMs = this.totalProcessingMs / this.stats.processed;
					this.stats.lastProcessedAt = new Date().toISOString();

					// ACK handled by manager
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					if (message.includes('module runner has been closed')) {
						console.warn(`[Worker:${this.queue}] Environment closed during processing — skipping retry/ack`);
						return;
					}

					const retryCount =
						(amqpMsg.properties?.headers?.['x-retry-count'] as number) ?? 0;

					if (retryCount < this.maxRetries) {
						this.stats.retried++;
						console.warn(
							`[Worker:${this.queue}] Retry ${retryCount + 1}/${this.maxRetries}:`,
							err
						);
						// NACK with requeue handled by manager
					} else {
						this.stats.failed++;
						this.stats.dlqCount++;
						console.error(
							`[Worker:${this.queue}] Max retries exceeded, routing to DLQ:`,
							err
						);

						// Publish to DLQ
						await this.publishToDLQ(amqpMsg, err);
					}
					throw err; // Re-throw for manager to NACK
				} finally {
					this.inFlightCount--;
				}
			});

			this.stats.isRunning = true;
			this.stats.readinessState = 'READY';
			console.log(
				`[Worker:${this.queue}] Started consuming (prefetch=${this.prefetch})`
			);
		} catch (err) {
			this.stats.isRunning = false;
			this.stats.readinessState = 'FAILED';
			this.stats.startError = err instanceof Error ? err.message : String(err);
			console.error(`[Worker:${this.queue}] Failed to start:`, err);
			throw err;
		}
	}

	/** Mark an intentionally unregistered consumer before startAll(). */
	markDisabled(): void {
		if (this.stats.isRunning) throw new Error(`Cannot disable running worker ${this.queue}`);
		this.stats.readinessState = 'DISABLED';
		this.stats.startError = null;
	}

	/**
	 * Graceful shutdown — stop accepting messages, await in-flight (5s timeout)
	 * Returns partial shutdown info
	 */
	async stop(): Promise<{ drained: boolean; inFlight: number }> {
		this.stopping = true;
		this.stats.isRunning = false;
		if (this.stats.readinessState === 'READY') this.stats.readinessState = 'NOT_STARTED';

		const deadline = Date.now() + 5000;
		while (this.inFlightCount > 0 && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 100));
		}

		const drained = this.inFlightCount === 0;
		if (!drained) {
			console.warn(
				`[Worker:${this.queue}] Shutdown with ${this.inFlightCount} in-flight messages`
			);
		}

		return { drained, inFlight: this.inFlightCount };
	}

	/** Get worker statistics */
	getStats(): Readonly<WorkerStats> {
		return { ...this.stats };
	}

	/** Check if worker is running */
	get isRunning(): boolean {
		return this.stats.isRunning;
	}

	/**
	 * Publish failed message to dead letter queue
	 */
	private async publishToDLQ(
		originalMsg: { content: Buffer; properties: { headers?: Record<string, unknown> } },
		error: unknown
	): Promise<void> {
		try {
			const { rabbitmq } = await import('./rabbitmq-manager-fixed.js');
			if (!rabbitmq) return;

			const dlqData = {
				originalQueue: this.queue,
				payload: JSON.parse(originalMsg.content.toString()),
				error: error instanceof Error ? error.message : String(error),
				failedAt: new Date().toISOString(),
				retryCount: (originalMsg.properties?.headers?.['x-retry-count'] as number) ?? 0
			};

			// Use analytics exchange to route DLQ messages (existing infrastructure)
			await rabbitmq.publishAnalyticsEvent({
				eventType: `dlq.${this.queue}`,
				payload: dlqData
			});
		} catch (dlqErr) {
			// DLQ publish failure — log full message payload so it can be recovered manually
			console.error(
				`[Worker:${this.queue}] DLQ publish failed — MESSAGE LOST:`,
				dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
				'\n  Payload:', originalMsg.content.toString().slice(0, 2000)
			);
		}
	}
}

// ─── WorkerRegistry ─────────────────────────────────────────────────────────

export interface RegistryStatus {
	total: number;
	running: number;
	failed: number;
	disabled: number;
	state: 'NOT_STARTED' | 'READY' | 'DEGRADED' | 'FAILED' | 'DISABLED';
	workers: Record<string, { running: boolean; state: WorkerStats['readinessState']; startError: string | null; stats: WorkerStats }>;
}

/**
 * WorkerRegistry — manages all queue workers with startAll/stopAll/getStats.
 * Partial startup failure = degraded mode, NOT crash.
 */
export class WorkerRegistry {
	private workers: QueueWorker<unknown>[] = [];

	register(worker: QueueWorker<unknown>, options: { enabled?: boolean } = {}): void {
		if (options.enabled === false) worker.markDisabled();
		this.workers.push(worker);
	}

	/**
	 * Start all registered workers. Partial failure is non-fatal.
	 * Returns count of successfully started workers.
	 */
	async startAll(): Promise<{ started: number; failed: number; disabled: number; state: RegistryStatus['state']; total: number; errors: string[] }> {
		const errors: string[] = [];
		const enabledWorkers = this.workers.filter((worker) => worker.getStats().readinessState !== 'DISABLED');
		const results = await Promise.allSettled(enabledWorkers.map((worker) => worker.start()));

		let started = 0;
		let failed = 0;

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const worker = enabledWorkers[i];
			if (result.status === 'fulfilled' && worker?.getStats().readinessState === 'READY') {
				started++;
			} else {
				failed++;
				const queueName = worker?.queue ?? 'unknown';
				const errMsg = result.status === 'rejected'
					? result.reason instanceof Error ? result.reason.message : String(result.reason)
					: worker?.getStats().startError ?? 'start resolved without consumer readiness';
				errors.push(`${queueName}: ${errMsg}`);
			}
		}

		const status = this.getStatus();
		return { started, failed, disabled: status.disabled, state: status.state, total: status.total, errors };
	}

	/**
	 * Graceful stop of all workers. Awaits in-flight messages (5s each).
	 */
	async stopAll(): Promise<{ drained: number; timedOut: number }> {
		const results = await Promise.allSettled(this.workers.map((w) => w.stop()));

		let drained = 0;
		let timedOut = 0;

		for (const result of results) {
			if (result.status === 'fulfilled' && result.value.drained) {
				drained++;
			} else {
				timedOut++;
			}
		}
		return { drained, timedOut };
	}

	/**
	 * Get status of all workers
	 */
	getStatus(): RegistryStatus {
		const workerMap: RegistryStatus['workers'] = {};
		let running = 0;
		let failed = 0;
		let disabled = 0;
		let notStarted = 0;

		for (const worker of this.workers) {
			const q = (worker as { queue: string }).queue;
			const stats = worker.getStats();
			workerMap[q] = { running: stats.isRunning, state: stats.readinessState, startError: stats.startError, stats };
			if (stats.isRunning) running++;
			if (stats.readinessState === 'FAILED') failed++;
			if (stats.readinessState === 'DISABLED') disabled++;
			if (stats.readinessState === 'NOT_STARTED') notStarted++;
		}

		const state: RegistryStatus['state'] = this.workers.length === 0 || notStarted === this.workers.length
			? 'NOT_STARTED'
			: running === this.workers.length
				? 'READY'
				: running > 0
					? 'DEGRADED'
					: failed > 0
						? 'FAILED'
						: disabled === this.workers.length
							? 'DISABLED'
							: 'DEGRADED';

		return { total: this.workers.length, running, failed, disabled, state, workers: workerMap };
	}
}

// ─── Concrete Workers ────────────────────────────────────────────────────────

/** Cache invalidation worker */
export class CacheInvalidateWorker extends QueueWorker<{
	key?: string;
	pattern?: string;
}> {
	readonly queue = 'cache.invalidate' as const;

	async process(data: { key?: string; pattern?: string }): Promise<void> {
		try {
			const { getRedis } = await import('$lib/server/redis.js');
			const redis = getRedis();
			if (!redis) return;

			if (data.key) {
				await redis.del(data.key);
			} else if (data.pattern) {
				const keys = await redis.keys(data.pattern);
				if (keys.length > 0) await redis.del(...keys);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('module runner has been closed')) {
				// Expected during hot reload — return silently
				return;
			}
			throw err;
		}
	}
}

/** Document embedding worker */
export class DocumentEmbedWorker extends QueueWorker<{
	documentId: string;
	text: string;
	collection?: string;
	metadata?: Record<string, unknown>;
}> {
	readonly queue = 'document.embed' as const;

	async process(data: {
		documentId: string;
		text: string;
		collection?: string;
		metadata?: Record<string, unknown>;
	}): Promise<void> {
		if (data.collection === 'evidence_items') {
			const { processEvidenceDocumentCanonicalV1 } = await import(
				'$lib/server/evidence/process-evidence-document-v1.js'
			);
			await processEvidenceDocumentCanonicalV1({
				evidenceId: data.documentId,
				text: data.text,
				fileName:
					(typeof data.metadata?.fileName === 'string' && data.metadata.fileName) ||
					(typeof data.metadata?.title === 'string' && data.metadata.title) ||
					undefined,
				contentType:
					(typeof data.metadata?.contentType === 'string' && data.metadata.contentType) ||
					(typeof data.metadata?.fileType === 'string' && data.metadata.fileType) ||
					undefined,
				metadata: data.metadata,
			});
			return;
		}

		const { generateSingleEmbedding } = await import(
			'$lib/server/grpc/embedding-client.js'
		);
		const embedding = await generateSingleEmbedding(data.text.slice(0, 2048));
		if (!embedding) throw new Error('Embedding generation failed');

		// Chain to vector.index — uses dispatch utility so inline fallback works
		const { dispatchOrExecuteInline } = await import('./dispatch-inline.js');
		await dispatchOrExecuteInline('vector.index', {
			documentId: data.documentId,
			embedding,
			collection: data.collection ?? 'legal_documents',
			metadata: {
				documentId: data.documentId,
				text: data.text.slice(0, 500)
			}
		});
	}
}

/** Evidence processing worker */
export class EvidenceProcessWorker extends QueueWorker<{
	evidenceId: string;
	text: string;
	contentType?: string;
	caseId?: string;
	metadata?: Record<string, unknown>;
	sourceRevision?: string;
	skipEmbedding?: boolean;
}> {
	readonly queue = 'evidence.process' as const;

	async process(data: {
		evidenceId: string;
		text: string;
		contentType?: string;
		caseId?: string;
		metadata?: Record<string, unknown>;
		sourceRevision?: string;
		skipEmbedding?: boolean;
	}): Promise<void> {
		let processedText = data.text;
		const meta = data.metadata ?? {};
		const objectKey =
			(typeof meta.objectKey === 'string' && meta.objectKey) ||
			(typeof meta.object_name === 'string' && meta.object_name) ||
			undefined;
		const expectedSourceSha256 =
			(typeof meta.sourceSha256 === 'string' && meta.sourceSha256) ||
			(typeof meta.source_revision === 'string' && meta.source_revision) ||
			(typeof data.sourceRevision === 'string' && data.sourceRevision) ||
			undefined;
		const bucket =
			(typeof meta.object_bucket === 'string' && meta.object_bucket) ||
			'legal-evidence';

		if (objectKey) {
			const { getSeaweedFile } = await import('$lib/server/seaweed-client.js');
			const { processDocument } = await import('$lib/server/document-processor.js');
			const { createHash } = await import('node:crypto');

			const sourceBytes = await getSeaweedFile(bucket, objectKey);
			const computedSha256 = 'sha256:' + createHash('sha256').update(sourceBytes).digest('hex');
			if (expectedSourceSha256 && computedSha256 !== expectedSourceSha256) {
				throw new Error(
					'EVIDENCE_SOURCE_SHA256_MISMATCH: expected ' + expectedSourceSha256 + ', got ' + computedSha256
				);
			}
			const extracted = await processDocument({
				buffer: sourceBytes,
				fileName:
					typeof meta.fileName === 'string' ? meta.fileName : 'evidence-file',
				mimeType:
					data.contentType ??
					(typeof meta.fileType === 'string'
						? meta.fileType
						: 'application/octet-stream'),
				evidenceId: data.evidenceId,
				skipEmbedding: true,
			});
			if (extracted.rawText && extracted.rawText.trim().length > 0) {
				processedText = extracted.rawText;
			}
		}

    // Granite-Docling enrichment: if text is short/empty and evidence is a document,
    // try to re-extract via Granite-Docling for better structure
    if (data.contentType !== 'audio_transcription') {
      try {
        const { isGraniteDoclingAvailable } = await import(
          '$lib/server/analysis/granite-docling.js'
        );
        if (await isGraniteDoclingAvailable()) {
          console.log(`[EvidenceProcess] Granite-Docling available for ${data.evidenceId}`);
        }
      } catch {
        // Non-fatal — proceed with existing text
      }
    }

    const { extractEntities } = await import('$lib/server/analysis/entity-extraction.js');
    const { detectForensicPatterns } = await import('$lib/server/analysis/forensics.js');

    const [entities, forensics] = await Promise.all([
      extractEntities(processedText).catch(() => []),
      Promise.resolve(detectForensicPatterns(processedText)),
    ]);

    // Chain to document embedding — uses dispatch utility so inline fallback works
    const { dispatchOrExecuteInline } = await import('./dispatch-inline.js');
    if (data.skipEmbedding) return;
    const dispatchResult = await dispatchOrExecuteInline('document.embed', {
      documentId: data.evidenceId,
      text: processedText,
      collection: 'evidence_items',
      metadata: {
        ...(data.metadata ?? {}),
        caseId: data.caseId ?? data.metadata?.caseId,
        source_revision: data.sourceRevision ?? data.metadata?.source_revision,
        entities,
        forensics: { flags: forensics },
        contentType: data.contentType,
      },
    });
		if (dispatchResult.error) throw new Error(`EVIDENCE_DOCUMENT_EMBED_FAILED:${dispatchResult.error}`);
	}
}

/** Analytics tracking worker */
export class AnalyticsTrackWorker extends QueueWorker<{
	eventType: string;
	payload: Record<string, unknown>;
}> {
	readonly queue = 'analytics.track' as const;

	/** Recommendation-relevant event types that should feed UserHistoryTracker */
	private static readonly TRACKABLE_EVENTS = new Set([
		'case_created', 'case_create', 'case_updated', 'evidence_uploaded',
		'rag_search', 'chat_query', 'document_indexed', 'report_create'
	]);

	async process(data: {
		eventType: string;
		payload: Record<string, unknown>;
	}): Promise<void> {
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		if (!redis) return;

		const key = `analytics:${data.eventType}`;
		const score = Date.now();
		await redis.zadd(
			key,
			score,
			JSON.stringify({ ...data.payload, timestamp: score })
		);
		await redis.zremrangebyrank(key, 0, -10001); // Keep last 10,000

		// Feed recommendation system: record user interaction for topic affinity tracking
		const userId = data.payload.userId as string | undefined;
		if (userId && AnalyticsTrackWorker.TRACKABLE_EVENTS.has(data.eventType)) {
			try {
				const { UserHistoryTracker } = await import('$lib/server/ml/user-history.js');
				const tracker = new UserHistoryTracker(userId);
				const documentId = ((data.payload.documentId ?? data.payload.evidenceId) || '') as string;
				const caseId = (data.payload.caseId || '') as string;
				await tracker.recordView(documentId, caseId, 0, undefined, undefined, { eventType: data.eventType, sourceEvent: data.eventType });
			} catch {
				// Non-fatal — recommendation tracking is best-effort
			}
		}
	}
}

/** Vector index worker — upserts embeddings into Qdrant */
export class VectorIndexWorker extends QueueWorker<{
	documentId: string;
	embedding: number[];
	collection?: string;
	metadata?: Record<string, unknown>;
}> {
	readonly queue = 'vector.index' as const;

	async process(data: {
		documentId: string;
		embedding: number[];
		collection?: string;
		metadata?: Record<string, unknown>;
	}): Promise<void> {
		if (data.collection === 'evidence_items') {
			throw new Error('EVIDENCE_QDRANT_DIRECT_INDEX_FORBIDDEN: use evidence_vectors and its projection outbox');
		}
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const collection = data.collection ?? 'legal_documents';

		await qdrant.batchUpsert({
			collection: collection as Parameters<typeof qdrant.batchUpsert>[0]['collection'],
			points: [
				{
					id: data.documentId,
					vector: data.embedding,
					payload: {
						documentId: data.documentId,
						...(data.metadata ?? {})
					}
				}
			]
		});
	}
}

/** Chat context worker — stores chat message embeddings for retrieval */
export class ChatContextWorker extends QueueWorker<{
	sessionId: string;
	message?: string;
	embedding?: number[];
	role?: string;
}> {
	readonly queue = 'chat.context' as const;

	async process(data: {
		sessionId: string;
		message?: string;
		embedding?: number[];
		role?: string;
		metadata?: Record<string, unknown>;
	}): Promise<void> {
		if (!data.message) return;

		// Generate embedding if not provided by producer
		let embedding = data.embedding;
		if (!embedding) {
			try {
				const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
				embedding = await generateSingleEmbedding(data.message.slice(0, 2048));
			} catch {
				// Embedding generation failed — skip indexing
				return;
			}
		}

		if (!embedding?.length) return;

		// Route through the canonical chat-memory indexer so writes land in the
		// Qdrant `chat_messages` collection with the `message` named vector —
		// matching what ACE's recallPastChats() reads from.
		const { indexChatMessage } = await import('$lib/server/ace/chat-memory.js');
		const id = Math.floor(Math.random() * 0x1fffffffffffff);
		await indexChatMessage(
			{
				id,
				sessionId: data.sessionId,
				role: data.role ?? 'user',
				content: data.message.slice(0, 2000),
				timestamp: Date.now(),
			},
			embedding,
		);
	}
}

/** Codebase index worker — AST chunking + dual embedding for code search */
export class CodebaseIndexWorker extends QueueWorker<{
	scope: string;
	incremental?: boolean;
}> {
	readonly queue = 'codebase.index' as const;
	protected maxRetries = 1; // Expensive operation, limit retries

	async process(data: { scope: string; incremental?: boolean }): Promise<void> {
		const { chunkFiles } = await import('$lib/server/indexer/ast-chunker.js');
		const { indexChunks } = await import('$lib/server/indexer/dual-embedder.js');
		const { resolve } = await import('path');
		const { readdir } = await import('fs/promises');

		const ROOT = resolve(process.cwd());
		const SCOPE_GLOBS: Record<string, string[]> = {
			routes: ['src/routes'],
			lib: ['src/lib'],
			tests: ['tests'],
			all: ['src/routes', 'src/lib', 'tests']
		};
		const INDEXABLE_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs']);
		const SKIP_DIRS = new Set([
			'node_modules',
			'.svelte-kit',
			'archives',
			'backups',
			'phase104-backups'
		]);

		const collectFiles = async (dir: string): Promise<string[]> => {
			const files: string[] = [];
			try {
				const entries = await readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					if (SKIP_DIRS.has(entry.name)) continue;
					const full = resolve(dir, entry.name);
					if (entry.isDirectory()) {
						files.push(...(await collectFiles(full)));
					} else if (
						entry.isFile() &&
						INDEXABLE_EXTENSIONS.has(
							entry.name.slice(entry.name.lastIndexOf('.'))
						)
					) {
						if (
							full.includes('lib/services/') &&
							!full.includes('lib/server/services/')
						)
							continue;
						files.push(full);
					}
				}
			} catch {
				/* directory missing */
			}
			return files;
		};

		const dirs = SCOPE_GLOBS[data.scope] ?? SCOPE_GLOBS.all;
		const allFiles: string[] = [];
		for (const dir of dirs) {
			allFiles.push(...(await collectFiles(resolve(ROOT, dir))));
		}

		const chunks = await chunkFiles(allFiles, ROOT);
		await indexChunks(chunks);
		console.log(
			`[Worker:codebase.index] Indexed ${allFiles.length} files, ${chunks.length} chunks`
		);
	}
}

/** Web search ingestion worker — embeddings + Qdrant push for external research */
export class WebIngestWorker extends QueueWorker<import('../retrieval/web-ingest.js').WebIngestMessage> {
	readonly queue = 'kb.ingest' as const;

	async process(data: import('../retrieval/web-ingest.js').WebIngestMessage): Promise<void> {
		const { processWebIngestMessage } = await import('../retrieval/web-ingest.js');
		await processWebIngestMessage(data);
	}
}

// ─── Default Registry ────────────────────────────────────────────────────────

/**
 * Create a pre-configured registry with all 7 workers.
 * Call `registry.startAll()` at boot time.
 */
export function createDefaultRegistry(): WorkerRegistry {
	const registry = new WorkerRegistry();
	registry.register(new CacheInvalidateWorker() as QueueWorker<unknown>);
	registry.register(new DocumentEmbedWorker() as QueueWorker<unknown>);
	registry.register(new EvidenceProcessWorker() as QueueWorker<unknown>);
	registry.register(new AnalyticsTrackWorker() as QueueWorker<unknown>);
	registry.register(new VectorIndexWorker() as QueueWorker<unknown>);
	registry.register(new ChatContextWorker() as QueueWorker<unknown>);
	registry.register(new WebIngestWorker() as QueueWorker<unknown>);
	registry.register(new CodebaseIndexWorker() as QueueWorker<unknown>);
	return registry;
}
