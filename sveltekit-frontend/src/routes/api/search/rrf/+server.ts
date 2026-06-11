import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { multiLaneRetrievalWithRRF, type RRFIntegrationOptions } from '$lib/server/retrieval/rrf-integration.js';
import { db } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';

const querySchema = z.object({
  query: z.string().min(1).max(4000),
  k: z.coerce.number().int().min(10).max(200).optional(),
  topK: z.coerce.number().int().min(1).max(100).optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  useWeights: z
    .enum(['default', 'bm25_heavy', 'concept_heavy', 'vector_heavy'])
    .optional()
    .default('default'),
});

const WEIGHT_PRESETS: Record<
  string,
  Partial<Record<string, number>>
> = {
  default: {
    postgres_trigram: 1.0,
    concept_overlap: 1.2,
    qdrant_vector: 1.0,
    neo4j_graph: 0.8,
  },
  bm25_heavy: {
    postgres_trigram: 2.0,
    concept_overlap: 1.0,
    qdrant_vector: 0.8,
    neo4j_graph: 0.6,
  },
  concept_heavy: {
    postgres_trigram: 0.8,
    concept_overlap: 2.0,
    qdrant_vector: 1.0,
    neo4j_graph: 0.7,
  },
  vector_heavy: {
    postgres_trigram: 0.8,
    concept_overlap: 1.0,
    qdrant_vector: 2.0,
    neo4j_graph: 0.8,
  },
};

export const POST: RequestHandler = async (event) => {
  try {
    const parsed = querySchema.parse(await event.request.json());
    const { query, k, topK, minScore, useWeights } = parsed;

    const pool = db;
    const weights = WEIGHT_PRESETS[useWeights];

    const opts: RRFIntegrationOptions = {
      k,
      topK,
      minScore,
      weights,
    };

    const output = await multiLaneRetrievalWithRRF(query, pool, opts);

    // Log query to Redis for analytics (fire-and-forget)
    const redis = getRedis();
    if (redis) {
      const queryHash = require('crypto')
        .createHash('sha256')
        .update(query)
        .digest('hex')
        .slice(0, 12);
      redis.hincrby('rrf:query_counts', queryHash, 1).catch(() => {});
      redis.hset(`rrf:query:${queryHash}`, 'query', query, 'results', output.results.length).catch(() => {});
    }

    return json({
      success: true,
      query,
      results: output.results.map((r) => ({
        id: r.id,
        score: r.combinedScore,
        source: r.source,
        sources: r.sources,
        text: r.text,
        breakdown: r.breakdown,
      })),
      breakdown: output.breakdown,
      durationMs: output.durationMs,
    });
  } catch (err) {
    const message = err instanceof z.ZodError ? `Validation error: ${err.message}` : String(err);
    console.error('RRF search error:', err);
    return json(
      {
        success: false,
        error: message,
        results: [],
        breakdown: { bm25Count: 0, conceptCount: 0, qdrantCount: 0, neoCount: 0 },
        durationMs: 0,
      },
      { status: 400 }
    );
  }
};
