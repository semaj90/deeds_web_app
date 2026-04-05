// Generic EmbeddingRepository abstraction for ingestion & semantic search

export interface IngestionJobRequest {
    evidenceId: string; // Existing evidence row id (metadata & file linkage)
    caseId?: string; // Optional case linkage
    filename?: string; // Original filename
    mimeType?: string; // MIME type
    textContent?: string; // Already extracted text
    model?: string; // Embedding model (default: nomic-embed-text)
    chunkSize?: number; // Override default chunk size
    chunkOverlap?: number; // Override default overlap
    metadata?: Record<string, any>; // Arbitrary metadata
}

export interface IngestionJobStatus {
    jobId: string;
	evidenceId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    totalChunks?: number;
    processedChunks?: number;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    model?: string;
}

export interface SimilarityQueryOptions {
    limit?: number; // Max results
    threshold?: number; // Minimum similarity (0-1)
    filter?: Record<string, any>; // Metadata filter
    model?: string; // Embedding model to use
}

export interface SimilarityResult {
    id: string;
    evidenceId?: string;
    documentId?: string;
	content: string;
    score: number; // 0-1 similarity
    metadata?: Record<string, any>;
    chunkIndex?: number;
}

export interface EmbeddingRepository {
    enqueueIngestion(job: IngestionJobRequest): Promise<IngestionJobStatus>;
    getJobStatus(jobId: string): Promise<IngestionJobStatus | null>;
    processNextJob(): Promise<IngestionJobStatus | null>;
    querySimilar(query: string, options?: SimilarityQueryOptions): Promise<SimilarityResult[]>;
}

import { enqueue, getStatus, processNext } from './ingestion-queue.js';

const queueBackedEmbeddingRepository: EmbeddingRepository = {
  enqueueIngestion(job: IngestionJobRequest): Promise<IngestionJobStatus> {
    return enqueue(job);
  },

  async getJobStatus(jobId: string): Promise<IngestionJobStatus | null> {
    return getStatus(jobId);
  },

  async processNextJob(): Promise<IngestionJobStatus | null> {
    return processNext(async (_payload, update) => {
      update({ totalChunks: 0, processedChunks: 0 });
    });
  },

  async querySimilar(
    _query: string,
    _options?: SimilarityQueryOptions
  ): Promise<SimilarityResult[]> {
    return [];
  },
};

// Factory loader (lazy to avoid circular imports in SvelteKit runtime)
let _repo: EmbeddingRepository | null = null;

export async function getEmbeddingRepository(): Promise<EmbeddingRepository> {
  if (_repo) return _repo;
  _repo = queueBackedEmbeddingRepository;
  return _repo;
}
