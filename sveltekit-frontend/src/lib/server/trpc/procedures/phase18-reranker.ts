import { z } from 'zod';
import { publicProcedure } from '../init.js';
import {
  phase18RequestEnvelopeSchema,
  phase18ResponseEnvelopeSchema,
  trpcProcedureInputSchema,
  validatePhase18Request,
} from '$lib/schemas/phase18-envelope-schema.js';
import type {
  Phase18RequestEnvelope,
  Phase18ResponseEnvelope,
} from '$lib/schemas/phase18-envelope-schema.js';
import { randomUUID } from 'node:crypto';

/**
 * tRPC procedure for Phase 18 XGBoost Reranker
 *
 * Input schema: trpcProcedureInputSchema (extends phase18RequestEnvelopeSchema with trpcContext)
 * Output schema: phase18ResponseEnvelopeSchema
 *
 * Callable from SvelteKit load functions, form actions, and client-side trpc client
 *
 * Example client usage:
 * ```typescript
 * const response = await trpc.phase18Reranker.query({
 *   metadata: { envelopeId: uuid(), phase: 18, createdAt: now(), ... },
 *   packets: [{ packetKey: '...', features: {...}, ... }],
 *   params: { topK: 10, returnReasons: true }
 * });
 * ```
 */

export const phase18RerankerProcedure = publicProcedure
  .input(trpcProcedureInputSchema)
  .output(phase18ResponseEnvelopeSchema)
  .query(async (opts) => {
    const { input, ctx } = opts;

    // Validate request structure
    const validation = validatePhase18Request(input);
    if (!validation.success) {
      return {
        metadata: {
          envelopeId: input.metadata.envelopeId,
          phase: 18,
          createdAt: new Date().toISOString(),
          source: 'trpc',
          version: '1.0',
          correlationId: input.metadata.correlationId || randomUUID(),
          requestId: input.metadata.requestId,
          mode: input.metadata.mode || 'inference'
        },
        requestId: input.metadata.requestId,
        success: false,
        results: [],
        error: {
          code: 'VALIDATION_ERROR',
          message: `Validation failed: ${(validation.error as any)?.issues?.[0]?.message || 'unknown error'}`,
          details: { validationError: validation.error }
        }
      };
    }

    const validInput = validation.data as Phase18RequestEnvelope;
    const { packets, params = {} as any } = validInput;
    const { topK = 10, returnReasons = false, returnLatency = false } = params;

    // Extract feature vectors and packet keys
    const packetKeys = packets.map(p => p.packetKey);
    const features = packets.map(p => p.features);

    // Validate dimensions
    if (packets.length === 0) {
      return {
        metadata: {
          ...input.metadata,
          createdAt: new Date().toISOString(),
          source: 'trpc'
        },
        requestId: input.metadata.requestId,
        success: false,
        results: [],
        error: {
          code: 'EMPTY_PACKETS',
          message: 'At least one packet required for reranking'
        }
      };
    }

    // Feature dimension validation (must be 13)
    const invalidFeatures = features.filter(f => f.values.length !== 13);
    if (invalidFeatures.length > 0) {
      return {
        metadata: {
          ...input.metadata,
          createdAt: new Date().toISOString(),
          source: 'trpc'
        },
        requestId: input.metadata.requestId,
        success: false,
        results: [],
        error: {
          code: 'INVALID_FEATURE_DIMENSION',
          message: `Expected 13 feature dimensions, got ${invalidFeatures[0].values.length}`,
          details: { invalidCount: invalidFeatures.length, totalPackets: packets.length }
        }
      };
    }

    // Do not return synthetic or non-deterministic scores. This legacy
    // envelope has no admitted revision-qualified feature bundle or owned
    // model identity. Scoring remains at the canonical executor boundary.
    const response: Phase18ResponseEnvelope = {
      metadata: {
        envelopeId: randomUUID(),
        phase: 18,
        createdAt: new Date().toISOString(),
        source: 'trpc',
        version: '1.0',
        correlationId: input.metadata.correlationId || randomUUID(),
        requestId: input.metadata.requestId,
        mode: input.metadata.mode || 'inference'
      },
      requestId: input.metadata.requestId,
      success: false,
      results: [],
      error: {
        code: 'OWNED_RERANKER_NOT_ADMITTED',
        message: 'Phase 18 scoring is unavailable until a revision-qualified owned model and feature bundle are admitted.',
        details: {
          canonicalOwner: 'canonical-rerank-executor',
          legacyFeatureDimension: 13,
          totalPackets: packets.length,
          requestedTopK: topK,
          returnReasons,
          returnLatency,
          writesPerformed: false,
        },
      },
      cache: {
        cacheKey: undefined,
        ttlSeconds: 3600,
        canCache: false
      }
    };

    return response;
  });

/**
 * tRPC mutation for reranking with side effects
 *
 * Can be used to:
 * - Persist reranking results to Postgres task_semantic_packets
 * - Update Redis cache with scores
 * - Emit events for downstream processing
 *
 * Requires authentication and returns audit trail
 */
export const phase18RerankerMutationProcedure = publicProcedure
  .input(trpcProcedureInputSchema)
  .output(phase18ResponseEnvelopeSchema.extend({
    auditTrail: z.object({
      persistedAt: z.string().datetime().optional(),
      cachedAt: z.string().datetime().optional(),
      eventsEmitted: z.number().default(0)
    }).optional()
  }))
  .mutation(async (opts) => {
    const { input, ctx } = opts;

    // Validate input
    const validation = validatePhase18Request(input);
    if (!validation.success) {
      return {
        metadata: {
          envelopeId: input.metadata.envelopeId,
          phase: 18,
          createdAt: new Date().toISOString(),
          source: 'trpc',
          version: '1.0',
          correlationId: input.metadata.correlationId || randomUUID(),
          requestId: input.metadata.requestId,
          mode: input.metadata.mode || 'inference'
        },
        requestId: input.metadata.requestId,
        success: false,
        results: [],
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: { validationError: validation.error }
        }
      };
    }

    // Do not synthesize results in a mutation path. The legacy procedure has
    // no admitted model/feature lineage and no authorized persistence owner.
    const validInput = validation.data as Phase18RequestEnvelope;
    const { packets, params = {} as any } = validInput;
    const { topK = 10, returnReasons = false } = params;

    const response = {
      metadata: {
        envelopeId: randomUUID(),
        phase: 18,
        createdAt: new Date().toISOString(),
        source: 'trpc',
        version: '1.0',
        correlationId: input.metadata.correlationId || randomUUID(),
        requestId: input.metadata.requestId,
        mode: input.metadata.mode || 'inference'
      },
      requestId: input.metadata.requestId,
      success: false,
      results: [],
      error: {
        code: 'OWNED_RERANKER_NOT_ADMITTED',
        message: 'Phase 18 mutation is unavailable until a revision-qualified owned model and feature bundle are admitted.',
        details: {
          canonicalOwner: 'canonical-rerank-executor',
          legacyFeatureDimension: 13,
          requestedTopK: topK,
          returnReasons,
          writesPerformed: false,
          persistencePerformed: false,
          cacheWritePerformed: false,
          eventsEmitted: 0,
        },
      },
      auditTrail: {
        eventsEmitted: 0
      }
    };

    return response as any;
  });
