/**
 * Embedding Worker — standalone async consumer for the `document.embed` queue.
 *
 * Runs as a separate Node.js process (or worker_threads child) to keep
 * embedding work off the main SvelteKit request thread.
 *
 * Architecture:
 *   RabbitMQ `document.embed` queue
 *     → this worker dequeues jobs
 *     → processDocument() (document-processor.ts)
 *     → embeddings stored in Qdrant `evidence_items` + pgvector `evidence_vectors`
 *     → ack on success, nack+requeue up to MAX_RETRIES then DLQ
 *
 * Depends on: document-processor.ts (Layer 2.1)
 *
 * Launch modes:
 *   1. Standalone process: `node -r tsm src/workers/embedding-worker.ts`
 *   2. Worker thread: `new Worker(workerPath, { workerData })` from compute-pool.ts
 *   3. Boot hook: `startEmbeddingWorker()` in hooks.server.ts (embedded mode)
 *
 * The embedded `startEmbeddingWorker()` is the recommended path for dev — it uses
 * the existing `document-embed-consumer.ts` which is already wired to RabbitMQ.
 */

import { isMainThread, parentPort, workerData } from 'worker_threads';

const MAX_RETRIES = 3;

// ─── Worker-thread protocol ───────────────────────────────────────────────────

export interface EmbedJob {
  documentId: string;
  text?: string;
  filePath?: string;
  fileName: string;
  mimeType: string;
  collection?: string;
  caseId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  _retryCount?: number;
}

export interface EmbedResult {
  documentId: string;
  chunkCount: number;
  embeddingDim: number;
  collection: string;
  durationMs: number;
  error?: string;
}

// ─── Core processing ──────────────────────────────────────────────────────────

async function processEmbedJob(job: EmbedJob): Promise<EmbedResult> {
  const start = Date.now();
  const collection = job.collection ?? 'evidence_items';

  try {
    // Get buffer from text or file path
    let buffer: Buffer;
    if (job.text) {
      buffer = Buffer.from(job.text, 'utf-8');
    } else if (job.filePath) {
      const { readFile } = await import('fs/promises');
      buffer = await readFile(job.filePath);
    } else {
      throw new Error('EmbedJob missing both text and filePath');
    }

    // Run through the unified document processor
    const { processDocument } = await import('../lib/server/document-processor.js');
    const result = await processDocument({
      buffer,
      fileName: job.fileName,
      mimeType: job.mimeType,
      evidenceId: job.documentId,
      skipEmbedding: false,
    });

    const { chunks, embeddings } = result;
    if (!embeddings || embeddings.length === 0) {
      throw new Error('Embedding step produced no vectors');
    }

    // Upsert to Qdrant
    const { qdrant } = await import('../lib/server/vector/qdrant-manager.js');
    const points = chunks.map((c, i) => ({
      id: crypto.randomUUID(),
      vector: embeddings[i] ?? [],
      payload: {
        documentId: job.documentId,
        caseId: job.caseId ?? null,
        userId: job.userId ?? null,
        text: c.text,
        chunkIndex: c.index,
        sectionPath: c.sectionPath,
        tokenCount: c.tokenCount,
        ...(job.metadata ?? {}),
      },
    }));

    await qdrant.batchUpsert({ collection, points });

    return {
      documentId: job.documentId,
      chunkCount: chunks.length,
      embeddingDim: embeddings[0]?.length ?? 0,
      collection,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      documentId: job.documentId,
      chunkCount: 0,
      embeddingDim: 0,
      collection,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Worker-thread mode ───────────────────────────────────────────────────────

if (!isMainThread && parentPort) {
  const job = workerData as EmbedJob;

  processEmbedJob(job).then((result) => {
    parentPort!.postMessage(result);
  }).catch((err) => {
    parentPort!.postMessage({
      documentId: job.documentId,
      chunkCount: 0,
      embeddingDim: 0,
      collection: job.collection ?? 'evidence_items',
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    } satisfies EmbedResult);
  });
}

// ─── Embedded/standalone consumer mode ───────────────────────────────────────

/**
 * Start an embedded RabbitMQ consumer for `document.embed`.
 * Preferred over the full standalone process in dev — shares the same Node.js
 * process as the SvelteKit server, no process management needed.
 *
 * Delegates to the existing `document-embed-consumer.ts` which already handles
 * RabbitMQ ack/nack, retry logic (MAX_RETRIES), and DLQ routing.
 */
export async function startEmbeddingWorker(): Promise<void> {
  const { startDocumentEmbedConsumer } = await import(
    '../lib/server/workers/document-embed-consumer.js'
  );
  await startDocumentEmbedConsumer();
  console.log('[EmbeddingWorker] consumer started — listening on document.embed queue');
}

export async function stopEmbeddingWorker(): Promise<void> {
  const { stopDocumentEmbedConsumer } = await import(
    '../lib/server/workers/document-embed-consumer.js'
  );
  await stopDocumentEmbedConsumer();
  console.log('[EmbeddingWorker] consumer stopped');
}

// ─── Standalone process entry ─────────────────────────────────────────────────

if (isMainThread && process.argv[1]?.includes('embedding-worker')) {
  console.log('[EmbeddingWorker] Starting in standalone process mode...');

  startEmbeddingWorker().catch((err) => {
    console.error('[EmbeddingWorker] Fatal startup error:', err);
    process.exit(1);
  });

  // Graceful shutdown
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      await stopEmbeddingWorker().catch(() => {});
      process.exit(0);
    });
  }
}
