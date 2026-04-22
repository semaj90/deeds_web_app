/**
 * POST /api/codeintel/ace
 *
 * Assembles a normalized ACE CodeIntel context bundle from:
 *   - cluster_summaries (Postgres)
 *   - codebase_chunk_index (Postgres)
 *   - health stats
 *
 * Body (JSON):
 *   query       string    — what the caller is trying to understand (required)
 *   repoId      string    — repo identifier (default: "default")
 *   clusterIds  number[]  — optional list of GPU cluster IDs to include
 *   chunkIds    string[]  — optional list of Qdrant chunk IDs / relative paths
 *   limit       number    — max cluster summaries to return (default 20, max 50)
 *
 * Response: AceCodeIntelContext — always returns a valid shape, never throws.
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { assembleAceContext } from '$lib/server/ace/codeintel-datastore.js';

const bodySchema = z.object({
  query: z.string().min(1).max(1000),
  repoId: z.string().max(100).default('default'),
  clusterIds: z.array(z.number().int().min(0).max(9999)).max(50).default([]),
  chunkIds: z.array(z.string().max(200)).max(50).default([]),
  limit: z.number().int().min(1).max(50).default(20),
  includeResearch: z.boolean().default(false),
  sessionId: z.string().uuid().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json(
      {
        query: '',
        repoId: 'default',
        clusterContext: [],
        chunkContext: [],
        health: { ok: false, chunkCount: 0, clusterCount: 0, embeddingCoverage: null },
        degraded: true,
        errors: ['Unauthorized'],
      },
      { status: 401 }
    );
  }

  const raw = await request.json().catch(() => null);
  if (!raw) {
    return json(
      {
        query: '',
        repoId: 'default',
        clusterContext: [],
        chunkContext: [],
        health: { ok: false, chunkCount: 0, clusterCount: 0, embeddingCoverage: null },
        degraded: true,
        errors: ['Invalid JSON body'],
      },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        query: '',
        repoId: 'default',
        clusterContext: [],
        chunkContext: [],
        health: { ok: false, chunkCount: 0, clusterCount: 0, embeddingCoverage: null },
        degraded: true,
        errors: [parsed.error.issues[0]?.message ?? 'Validation error'],
      },
      { status: 400 }
    );
  }

  const { query, repoId, clusterIds, chunkIds, limit, includeResearch, sessionId } = parsed.data;

  const context = await assembleAceContext(query, {
    repoId,
    clusterIds: clusterIds.length ? clusterIds : undefined,
    chunkIds: chunkIds.length ? chunkIds : undefined,
    limit,
    includeResearch,
    sessionId,
  });

  return json(context, { status: context.degraded ? 207 : 200 });
};
