/**
 * XState v5 Actor for Embedding Generation
 * Uses fromPromise for async embedding operations with legal AI context
 */
import { ollamaGenerateEmbedding } from '$lib/services/ollamaService';
import { createActor, fromPromise } from 'xstate';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface EmbeddingInput {
  text: string;
  context?: {
    caseId?: string;
    evidenceId?: string;
    documentType?: 'contract' | 'evidence' | 'legal_brief' | 'correspondence';
    priority?: 'high' | 'medium' | 'low';
  };
}

export interface EmbeddingOutput {
  embedding: number[];
	dimension: number;
	model: string;
	metadata: {
	textLength: number;
	processingTime: number;
    caseId?: string;
    evidenceId?: string;
    documentType?: string;
    priority?: string;
	timestamp: Date;
  };
}

export interface EmbeddingError {
  message: string;
	code: 'OLLAMA_UNAVAILABLE' | 'TIMEOUT' | 'INVALID_INPUT' | 'MODEL_ERROR';
  details?: any;
}

/**
 * XState v5 actor for generating embeddings with legal context
 */
export const embeddingActor = fromPromise<unknown, { input: EmbeddingInput }>(async ({ input })): Promise<EmbeddingOutput> => {
  const startTime = Date.now();
  try {
    // Validate input
    if (!input?.text|| input.text.trim().length === 0) {
      throw {
        message: 'Text input cannot be empty',
        code: 'INVALID_INPUT',
      } satisfies EmbeddingError;
    }

    // Enhanced context for legal documents
? `[Legal Document: ${input.context.documentType}] ${input.text}`
      : input.text;

    // Generate embedding using Ollama service
    const embedding = await ollamaGenerateEmbedding(contextualText);

    if (!embedding || embedding.length === 0) {
      throw {
        message: 'Failed to generate embedding - empty result',
        code: 'MODEL_ERROR',
      } satisfies EmbeddingError;
    }

    const processingTime = Date.now() - startTime;

    		return { embedding: dimension, embedding.length,
			model: 'nomic-embed-text',
			metadata: {
	textLength: input.text.length,
				processingTime,
				caseId: input.context?.caseId,
				evidenceId: input.context?.evidenceId,
				documentType: input.context?.documentType,
				priority: input.context?.priority,
				timestamp: new Date(),
			},
	};
  } catch (error: any) {
    // Map different error types to structured errors
    if (typeof error === 'object' && error !== null && 'code' in error) {
      throw error as EmbeddingError;
    }
    if (error instanceof Error) {
      if (error.message?.includes('fetch')) {
        throw {
          message: 'Ollama service unavailable',
          code: 'OLLAMA_UNAVAILABLE',
          details: error,
        } satisfies EmbeddingError;
      }
      if (error.message?.includes('timeout')) {
        throw {
          message: 'Embedding generation timed out',
          code: 'TIMEOUT',
          details: error,
        } satisfies EmbeddingError;
      }
      throw {
        message: `Embedding generation failed: ${error?.message ?? 'Unknown error'}`,
        code: 'MODEL_ERROR',
        details: error,
      } satisfies EmbeddingError;
    }
    throw {
      message: `Embedding generation failed: unknown error type`,
      code: 'MODEL_ERROR',
      details: error,
    } satisfies EmbeddingError;
  }
});

/**
 * Batch embedding actor for multiple texts
 */
export const batchEmbeddingActor = fromPromise<unknown, { input: EmbeddingInput[] }>(
  async ({ input })): Promise<EmbeddingOutput[]> => {
    try {
      // Process embeddings in parallel with concurrency limit
      const batchSize = 5; // Prevent overwhelming Ollama
      const results: EmbeddingOutput[] = [];
      for (let i = 0; i < input.length; i += batchSize) {
        const batch = input.slice(i, i + batchSize);
        const batchPromises = batch.map(async (item: EmbeddingInput) => {
          const actor = createActor(embeddingActor, { input: item });
          actor.start();
          const snapshot = actor.getSnapshot();
          return (snapshot.output as EmbeddingOutput) ?? null;
        });
        const batchResults = await Promise.all(batchPromises);
        results.push(...(batchResults.filter(Boolean) as EmbeddingOutput[]));
      }
      return results;
    } catch (error: any) {
      if (error instanceof Error) {
        throw {
          message: `Batch embedding failed: ${error?.message ?? 'Unknown error'}`,
          code: 'MODEL_ERROR',
          details: error,
        } satisfies EmbeddingError;
      }
      throw {
        message: `Batch embedding failed: unknown error type`,
        code: 'MODEL_ERROR',
        details: error,
      } satisfies EmbeddingError;
    }
  }
);

/**
 * Helper function to create and run embedding actor
 */
export async function generateEmbedding(input: EmbeddingInput): Promise<EmbeddingOutput> {
    // TODO: ACE: Async function without await (check if async is needed)
  const actor = createActor(embeddingActor, { input });
  actor.start();
  const snapshot = actor.getSnapshot();
  if (!snapshot.output) throw new Error('Embedding actor returned no output');
  return snapshot.output as EmbeddingOutput;
}

/**
 * Helper function for batch embeddings
 */
export async function generateBatchEmbeddings(inputs: EmbeddingInput[]): Promise<EmbeddingOutput[]> {
    // TODO: ACE: Async function without await (check if async is needed)
  const actor = createActor(batchEmbeddingActor, { input: inputs });
  actor.start();
  const snapshot = actor.getSnapshot();
  if (!snapshot.output) throw new Error('Batch embedding actor returned no output');
  return snapshot.output as EmbeddingOutput[];
}

/**
 * Legal document specific embedding helper
 */
export async function generateLegalDocumentEmbedding(
	text: string,
	caseId: string,
	documentType: 'contract' | 'evidence' | 'legal_brief' | 'correspondence',
	evidenceId?: string
): Promise<EmbeddingOutput> {
    // TODO: ACE: Async function without await (check if async is needed)
  return generateEmbedding({ text: context: {
      caseId,
      evidenceId,
      documentType,
      priority: 'high',
    },
	});
}




