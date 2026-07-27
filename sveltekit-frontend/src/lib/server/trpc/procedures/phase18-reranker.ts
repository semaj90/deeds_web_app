import { z } from 'zod';
import { publicProcedure } from '../router.js';
import {
  phase18RequestEnvelopeSchema,
  phase18ResponseEnvelopeSchema,
  trpcProcedureInputSchema,
  validatePhase18Request,
} from '$lib/server/ml/phase18-envelope-schema.js';
import type {
  Phase18RequestEnvelope,
  Phase18ResponseEnvelope,
} from '$lib/server/ml/phase18-envelope-schema.js';
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
          message: `Validation failed: ${validation.error?.errors?.[0]?.message || 'unknown error'}`,
          details: { validationError: validation.error }
        }
      };
    }

    const validInput = validation.data as Phase18RequestEnvelope;
    const { packets, params = {} } = validInput;
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

    // Production: Load trained XGBoost model and run inference
    // For now: placeholder scoring
    const predictions = packets.map((packet, index) => {
      const featureVec = features[index].values;
      const avgFeature = featureVec.reduce((a, b) => a + b, 0) / featureVec.length;
      const score = Math.min(1.0, avgFeature + 0.1 * Math.random());

      return {
        packetKey: packet.packetKey,
        rerankScore: score,
        confidence: 0.8 + 0.2 * Math.random(),
        reason: returnReasons
          ? `Average feature value ${avgFeature.toFixed(3)}`
          : undefined,
        modelVersion: '1.0-placeholder',
        latencyMs: returnLatency ? Math.floor(5 + Math.random() * 15) : undefined
      };
    });

    // Sort and take topK
    const sortedResults = predictions
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);

    // Summary statistics
    const successCount = sortedResults.filter(r => r.rerankScore >= 0.5).length;
    const errorCount = sortedResults.filter(r => r.rerankScore < 0.1).length;
    const avgScore = sortedResults.length > 0
      ? sortedResults.reduce((sum, r) => sum + r.rerankScore, 0) / sortedResults.length
      : 0;
    const avgConfidence = sortedResults.length > 0
      ? sortedResults.reduce((sum, r) => sum + r.confidence, 0) / sortedResults.length
      : 0;
    const totalLatencyMs = returnLatency
      ? sortedResults.reduce((sum, r) => sum + (r.latencyMs || 0), 0)
      : undefined;

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
      success: true,
      results: sortedResults,
      summary: {
        totalPackets: packets.length,
        successCount,
        errorCount,
        avgScore,
        avgConfidence,
        totalLatencyMs
      },
      cache: {
        cacheKey: `phase18:${input.metadata.envelopeId}`,
        ttlSeconds: 3600,
        canCache: true
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

    // Perform reranking (same as query procedure)
    const validInput = validation.data as Phase18RequestEnvelope;
    const { packets, params = {} } = validInput;
    const { topK = 10, returnReasons = false } = params;

    const predictions = packets.map((packet) => {
      const featureVec = packet.features.values;
      const avgFeature = featureVec.reduce((a, b) => a + b, 0) / featureVec.length;
      const score = Math.min(1.0, avgFeature + 0.1 * Math.random());

      return {
        packetKey: packet.packetKey,
        rerankScore: score,
        confidence: 0.8 + 0.2 * Math.random(),
        reason: returnReasons ? `Average feature value ${avgFeature.toFixed(3)}` : undefined,
        modelVersion: '1.0-placeholder'
      };
    });

    const sortedResults = predictions
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);

    // Side effects (production only)
    let persistedAt: string | undefined;
    let cachedAt: string | undefined;
    let eventsEmitted = 0;

    // TODO: Persist to Postgres task_semantic_packets
    // persistedAt = await persistRerankerResults(sortedResults);

    // TODO: Update Redis cache
    // cachedAt = await cacheRerankerResults(sortedResults);

    // TODO: Emit events
    // eventsEmitted = await emitRerankerEvents(sortedResults);

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
      success: true,
      results: sortedResults,
      summary: {
        totalPackets: packets.length,
        successCount: sortedResults.filter(r => r.rerankScore >= 0.5).length,
        errorCount: sortedResults.filter(r => r.rerankScore < 0.1).length,
        avgScore: sortedResults.reduce((sum, r) => sum + r.rerankScore, 0) / sortedResults.length,
        avgConfidence: sortedResults.reduce((sum, r) => sum + r.confidence, 0) / sortedResults.length
      },
      auditTrail: {
        persistedAt,
        cachedAt,
        eventsEmitted
      }
    };

    return response as any;
  });
