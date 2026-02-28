/* eslint-disable no-restricted-globals */
import { getEmbeddingViaGate } from '$lib/server/embedding-gateway.js';
import type { ChunkJob, EmbedResult } from '$lib/types/pipeline';
import { parentPort, workerData } from 'worker_threads';

// Local type definition to ensure worker has correct shape
interface WorkerChunkJob extends ChunkJob {
    text: string;
    model?: string;
    tags?: string[];
}

async function run(): Promise<void> {
    const job = workerData as WorkerChunkJob;
    try {
        const res = await getEmbeddingViaGate(
            fetch as unknown as typeof globalThis.fetch,
            job.text,
            {
                model: job.model ?? "unknown",
                tags: job.tags
            }
        );

        const out: EmbedResult = {
            docId: job.docId,
            chunkId: job.chunkId,
            embedding: res.embedding,
            model: res.model ?? "unknown",
            backend: res.backend
        };

        const msg = { ok: true, result: out };
        const transferList = out.embedding instanceof Float32Array
            ? [out.embedding.buffer]
            : [];
        parentPort?.postMessage(msg, transferList as any);
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        parentPort?.postMessage({ ok: false, error: errorMessage });
    }
}

run();



