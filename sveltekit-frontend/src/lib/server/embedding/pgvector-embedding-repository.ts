// PgVector-backed implementation of EmbeddingRepository with Gemma embeddings priority.
import type {
    EmbeddingRepository, IngestionJobRequest,
    IngestionJobStatus, SimilarityQueryOptions
} from '$lib/types/embedding';
import { sql } from 'drizzle-orm';
import { db } from '../db/unified-client.js'; // Updated to use unified client
import { embeddingCacheService } from '../embedding-cache-service.js';

const DEFAULT_MODEL = 'embeddinggemma:latest';

async function embedContent(text: string, model: string): Promise<number[]> {
    const embedding = await embeddingCacheService.getEmbedding(text, model);
    if (embedding) return embedding;

    // If not in cache, fallback to generating it (implementation detail usually inside embedding service)
    // Here we might call the upstream service directly if needed
    return []; // Placeholder if embedding service fails
}

async function enqueueIngestion(job: IngestionJobRequest): Promise<IngestionJobStatus> {
    // Stub implementation for queue
    return {
        jobId: 'stub-job-' + Date.now(),
        evidenceId: job.evidenceId,
        status: 'queued'
    };
}

async function processNextJob(): Promise<IngestionJobStatus | null> {
    // Stub implementation
    return null;
}

async function getJobStatus(jobId: string): Promise<IngestionJobStatus | null> {
    // Stub implementation
    return null;
}

async function querySimilar(query: string, options: SimilarityQueryOptions = {}): Promise<SimilarityResult[]> {
    const model = options.model || DEFAULT_MODEL;
    const limit = options.limit || 8;

    const queryEmbedding = await embedContent(query, model);
    if (queryEmbedding.length === 0) return [];

    const embeddingStr = JSON.stringify(queryEmbedding);

    try {
        const rows = await db.execute(sql`
            SELECT id, document_id, content, chunk_index, (embedding <=> ${embeddingStr}::vector) as distance
            FROM document_chunks
            ORDER BY embedding <=> ${embeddingStr}::vector
            LIMIT ${limit}
        `);

        return rows.map((r: any) => ({
            id: String(r.id),
            documentId: String(r.document_id),
            content: String(r.content),
            chunkIndex: Number(r.chunk_index),
            score: 1 - (Number(r.distance) || 0)
        }));
    } catch (error) {
        console.error('Vector query failed:', error);
        return [];
    }
}

export const pgvectorEmbeddingRepository: EmbeddingRepository = {
    enqueueIngestion,
    getJobStatus,
    processNextJob,
    querySimilar
};
