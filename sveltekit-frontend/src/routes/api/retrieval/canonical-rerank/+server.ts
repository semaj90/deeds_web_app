/**
 * POST /api/retrieval/canonical-rerank
 *
 * Thin transport wrapper around the canonical rerank executor.
 * The executor owns cache orchestration, model fallback, and provenance.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { FeatureEnvelopeSchema } from '$lib/server/retrieval/feature-envelope.js';
import {
  rerankCanonicalFeatureEnvelopes,
  type CanonicalRerankEnvelope,
} from '$lib/server/retrieval/canonical-rerank-executor.js';

const CanonicalRerankRequestSchema = z.object({
  query: z.string().min(1, 'Missing query string').max(5000),
  envelopes: z.array(FeatureEnvelopeSchema).min(1, 'At least one feature envelope is required'),
  weights: z.record(z.string(), z.number()).optional(),
  authScope: z.string().min(1).optional(),
  rendererVersion: z.string().min(1).optional(),
  maxLength: z.number().int().positive().max(64_000).optional(),
  topK: z.number().int().positive().max(200).optional(),
  cachePolicy: z.enum(['enabled', 'disabled']).optional(),
});

export const POST: RequestHandler = async ({ request }) => {
  const parsed = CanonicalRerankRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return json(
      {
        error: parsed.error.issues[0]?.message ?? 'Invalid canonical rerank request',
      },
      { status: 400 },
    );
  }

  const {
    query,
    envelopes,
    weights,
    authScope,
    rendererVersion,
    maxLength,
    topK,
    cachePolicy,
  } = parsed.data;

  const ranked = await rerankCanonicalFeatureEnvelopes(
    query,
    envelopes as CanonicalRerankEnvelope[],
    {
      weights,
      authScope: authScope ?? request.headers.get('x-auth-scope') ?? 'public',
      rendererVersion: rendererVersion ?? 'canonical-envelope-v1',
      maxLength,
      topK,
      cachePolicy,
    },
  );

  const results = ranked.results;

  return json({
    query,
    input_count: envelopes.length,
    output_count: results.length,
    results,
    top: results.slice(0, topK ?? 20).map((envelope) => ({
      packet_key: envelope.packet_key,
      feature_id: envelope.feature_id,
      source_ref: envelope.source_ref,
      retrieved_rank: envelope.retrieved_rank,
      rank_after: envelope.rank_after,
      cross_encoder_score: envelope.cross_encoder_score,
      blended_score: envelope.blended_score,
      model_version: envelope.model_version,
    })),
    provenance: ranked.provenance,
  });
};

