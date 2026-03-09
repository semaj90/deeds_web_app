/**
 * SvelteKit API Endpoint: Document Processing Pipeline
 * Orchestrates the complete document processing workflow:
 * Fetch → Process → Vectorize → Rank → Store
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { autoDocumentFetcher } from '../../../../lib/services/auto-document-fetcher.js';
import { documentProcessor } from '../../../../lib/services/document-processor.js';
import { gemmaEmbeddingService } from '../../../../lib/services/gemma-embedding-service.js';
import { ragRankingSystem } from '../../../../lib/services/rag-ranking-system.js';
import { postgresqlVectorStorage } from '../../../../lib/services/postgresql-vector-storage.js';

interface ProcessingRequest {
  sources?: string[];
  maxDocuments?: number;
  includeEmbeddings?: boolean;
  storeResults?: boolean;
  processingOptions?: {
    extractEntities?: boolean;
    calculateComplexity?: boolean;
    generateTags?: boolean;
    batchProcess?: boolean;
  };
  filters?: {
    legal_areas?: string[];
    document_types?: string[];
    jurisdictions?: string[];
  };
}

interface ProcessingResponse {
  success: boolean;
  jobId: string;
  status: 'started' | 'processing' | 'completed' | 'failed';
  progress?: {
    stage: string;
    completed: number;
    total: number;
    percentage: number;
  };
  results?: {
    documents_fetched: number;
    documents_processed: number;
    embeddings_generated: number;
    documents_stored: number;
    processing_time_ms: number;
  };
  error?: string;
  data?: any;
}

// In-memory job tracking (in production, use Redis or database)
const activeJobs = new Map<
  string,
  {
    id: string;
    status: 'started' | 'processing' | 'completed' | 'failed';
    stage: string;
    progress: { completed: number; total: number };
    startTime: number;
    results?: any;
    error?: string;
  }
>();

/**
 * POST: Start document processing pipeline
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: ProcessingRequest = await request.json();
    const jobId = generateJobId();

    console.log(`🚀 Starting document processing job: ${jobId}`);

    // Initialize job tracking
    activeJobs.set(jobId, {
      id: jobId,
      status: 'started',
      stage: 'initializing',
      progress: { completed: 0, total: 100 },
      startTime: Date.now(),
    });

    // Start async processing (don't await - return immediately)
    processDocuments(jobId, body).catch((error) => {
      console.error(`❌ Job ${jobId} failed:`, error);
      const job = activeJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        activeJobs.set(jobId, job);
      }
    });

    return json<ProcessingResponse>({
      success: true,
      jobId,
      status: 'started',
      progress: {
        stage: 'initializing',
        completed: 0,
        total: 100,
        percentage: 0,
      },
    });
  } catch (err) {
    console.error('❌ Failed to start document processing:', err);
    throw error(400, {
      message: 'Invalid request parameters',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};

/**
 * GET: Check job status
 */
export const GET: RequestHandler = async ({ url }) => {
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    throw error(400, 'Job ID is required');
  }

  const job = activeJobs.get(jobId);

  if (!job) {
    throw error(404, 'Job not found');
  }

  const response: ProcessingResponse = {
    success: job.status !== 'failed',
    jobId: job.id,
    status: job.status,
    progress: {
      stage: job.stage,
      completed: job.progress.completed,
      total: job.progress.total,
      percentage: Math.round((job.progress.completed / job.progress.total) * 100),
    },
    results: job.results,
    error: job.error,
  };

  return json(response);
};

/**
 * Async document processing workflow
 */
async function processDocuments(jobId: string, request: ProcessingRequest): Promise<void> {
  const job = activeJobs.get(jobId)!;
  const startTime = Date.now();

  try {
    // Stage 1: Initialize services
    updateJobProgress(jobId, 'initializing', 5, 100);

    await autoDocumentFetcher.initialize();
    await documentProcessor.initialize();
    await gemmaEmbeddingService.initialize();
    await postgresqlVectorStorage.initialize();

    // Stage 2: Fetch documents
    updateJobProgress(jobId, 'fetching_documents', 10, 100);

    const fetchedDocs = await autoDocumentFetcher.fetchFromSources(
      request.sources,
      request.maxDocuments || 50
    );

    if (fetchedDocs.length === 0) {
      throw new Error('No documents were fetched');
    }

    updateJobProgress(jobId, 'fetching_documents', 25, 100);

    // Stage 3: Process documents
    updateJobProgress(jobId, 'processing_documents', 30, 100);

    const processingResult = await documentProcessor.processDocuments(
      fetchedDocs,
      request.processingOptions || {}
    );

    updateJobProgress(jobId, 'processing_documents', 45, 100);

    // Stage 4: Generate embeddings (if requested)
    let vectorizedDocs = [];
    if (request.includeEmbeddings !== false) {
      updateJobProgress(jobId, 'generating_embeddings', 50, 100);

      const embeddingBatch = await gemmaEmbeddingService.vectorizeDocuments(
        processingResult.processed,
        {
          includeDocumentEmbedding: true,
          includeChunkEmbeddings: true,
          onProgress: (completed, total) => {
            const progressPercent = 50 + Math.round((completed / total) * 25);
            updateJobProgress(jobId, 'generating_embeddings', progressPercent, 100);
          },
        }
      );

      vectorizedDocs = embeddingBatch.documents;
      updateJobProgress(jobId, 'generating_embeddings', 75, 100);
    } else {
      vectorizedDocs = processingResult.processed as any[];
    }

    // Stage 5: Store results (if requested)
    let storageResults = null;
    if (request.storeResults !== false) {
      updateJobProgress(jobId, 'storing_results', 80, 100);

      storageResults = await postgresqlVectorStorage.storeDocuments(vectorizedDocs, {
        includeChunks: true,
      });

      updateJobProgress(jobId, 'storing_results', 95, 100);
    }

    // Stage 6: Complete
    const processingTimeMs = Date.now() - startTime;

    const finalResults = {
      documents_fetched: fetchedDocs.length,
      documents_processed: processingResult.processed.length,
      embeddings_generated: vectorizedDocs.reduce((sum, doc) => sum + doc.chunks.length, 0),
      documents_stored: storageResults ? storageResults.stored + storageResults.updated : 0,
      processing_time_ms: processingTimeMs,
      statistics: processingResult.statistics,
      storage_results: storageResults,
    };

    // Update job as completed
    const finalJob = activeJobs.get(jobId)!;
    finalJob.status = 'completed';
    finalJob.stage = 'completed';
    finalJob.progress = { completed: 100, total: 100 };
    finalJob.results = finalResults;
    activeJobs.set(jobId, finalJob);

    console.log(`✅ Job ${jobId} completed in ${processingTimeMs}ms`);
  } catch (err) {
    console.error(`❌ Job ${jobId} failed:`, err);

    const failedJob = activeJobs.get(jobId)!;
    failedJob.status = 'failed';
    failedJob.error = err instanceof Error ? err.message : 'Unknown error';
    activeJobs.set(jobId, failedJob);

    throw err;
  }
}

/**
 * Helper functions
 */
function updateJobProgress(jobId: string, stage: string, completed: number, total: number): void {
  const job = activeJobs.get(jobId);
  if (job) {
    job.status = 'processing';
    job.stage = stage;
    job.progress = { completed, total };
    activeJobs.set(jobId, job);

    console.log(`📊 Job ${jobId}: ${stage} (${completed}/${total})`);
  }
}

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Cleanup old jobs periodically (run every 5 minutes)
 */
setInterval(
  () => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [jobId, job] of activeJobs.entries()) {
      if (now - job.startTime > maxAge) {
        activeJobs.delete(jobId);
        console.log(`🧹 Cleaned up old job: ${jobId}`);
      }
    }
  },
  5 * 60 * 1000
);
