// PgVector-backed implementation of EmbeddingRepository with Gemma embeddings priority.
import type {
    EmbeddingRepository, IngestionJobRequest,
    IngestionJobStatus, SimilarityQueryOptions
} from '$lib/types/embedding';
import { sql } from 'drizzle-orm/pg-core';
import { db } from '../db/unified-client.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';

const DEFAULT_MODEL = 'embeddinggemma:latest';

interface SimilarityResult {
    id: string;
    documentId: string;
    content: string;
    chunkIndex: number;
    score: number;
}

async function embedContent(text: string, _model: string): Promise<number[]> {
    try {
        return await generateSingleEmbedding(text);
    } catch {
        return [];
    }
}

async function enqueueIngestion(job: IngestionJobRequest): Promise<IngestionJobStatus> {
    return {
        jobId: 'stub-job-' + Date.now(),
        evidenceId: job.evidenceId,
        status: 'queued'
    };
}

async function processNextJob(): Promise<IngestionJobStatus | null> {
    return null;
}

async function getJobStatus(_jobId: string): Promise<IngestionJobStatus | null> {
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
