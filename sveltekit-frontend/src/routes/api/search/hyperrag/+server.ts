import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createSearchRuntime, type SearchResult } from '$lib/server/retrieval/search-runtime.js';
import { bifrostChat, VLM_MODELS } from '$lib/server/ollama.js';

const requestSchema = z.object({
  query: z.string().trim().min(1, 'Query string is required').max(1024, 'Query string is too long'),
  mode: z.enum(['codebase', 'evidence', 'legal', 'docs']).default('codebase'),
  topK: z.number().int().min(1).max(50).optional(),
  useTurboVec: z.boolean().optional(),
  useGraph: z.boolean().optional(),
  useAceCache: z.boolean().optional(),
  synthesize: z.boolean().optional(),
});

function emptyResult(error: string, status: number) {
  return json(
    {
      query: '',
      variants: [],
      hits: [],
      graphPaths: [],
      synthesis: null,
      error,
      provenance: { qdrant: false, turbovec: false, redis: false, neo4j: false, ace: false },
    },
    { status },
  );
}

function toHyperRagHit(packet: SearchResult['packets'][number]) {
  const enriched = packet as any;
  return {
    id: enriched.packet_key ?? enriched.chunk_id,
    sourcePath: enriched.source_ref ?? enriched.relative_path ?? undefined,
    title: enriched.semantic_title ?? enriched.title ?? enriched.symbol ?? enriched.source_ref ?? enriched.chunk_id,
    text: enriched.summary ?? enriched.content ?? '',
    score: enriched.cross_encoder_score ?? enriched.blended_score ?? enriched.retrieval_score ?? 0,
    scoreWeightedSum: enriched.blended_score ?? enriched.retrieval_score ?? 0,
    signals: {
      dense: enriched.dense?.score,
      graphAuthority: enriched.authority?.score ?? enriched.page_rank_score ?? undefined,
      clusterMatch: enriched.som_cluster ?? undefined,
      pagerank: enriched.page_rank_score ?? undefined,
      aceBoost: enriched.ace_boost ?? undefined,
      turbovec: enriched.turbovec_score ?? undefined,
      topoClass: enriched.domain ?? undefined,
      lexicalBoost: enriched.lexical?.score,
      taskBoost: enriched.task_boost ?? undefined,
      activity_w: enriched.activity_w ?? undefined,
      cluster_alias: enriched.cluster_alias ?? undefined,
      recencyOrHitRate: enriched.recency?.score,
      engramBoost: enriched.engram_boost ?? undefined,
    },
    reasons: [
      enriched.retrieval_source ? `retrieval:${enriched.retrieval_source}` : 'retrieval:canonical',
      enriched.domain ? `domain:${enriched.domain}` : 'domain:unknown',
    ],
    payload: enriched as Record<string, unknown>,
    vector: undefined,
  };
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return emptyResult('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return emptyResult(parsed.error.issues.map((issue) => issue.message).join('; '), 400);
    }

    const input = parsed.data;
    const runtime = createSearchRuntime({ userId: locals.user.id });
    const result = await runtime.search({
      text: input.query,
      topK: input.topK ?? 15,
    });

    let synthesis: string | null = null;
    if (input.synthesize) {
      try {
        synthesis = await bifrostChat(
          [
            {
              role: 'user',
              content: `Synthesize a concise answer from these packets:\n${result.packets
                .slice(0, 5)
                .map((packet, index) => `[${index + 1}] ${(packet as any).source_ref ?? (packet as any).chunk_id}\n${(packet as any).summary ?? ''}`)
                .join('\n\n')}`,
            },
          ],
          VLM_MODELS.legal,
        );
      } catch {
        synthesis = null;
      }
    }

    return json({
      query: result.metadata.query,
      variants: [input.query],
      hits: result.packets.map(toHyperRagHit),
      graphPaths: [],
      synthesis,
      provenance: {
        qdrant: result.provenance.retrievalSources.includes('qdrant'),
        turbovec: false,
        redis: result.provenance.retrievalSources.includes('postgres_trigram'),
        neo4j: result.provenance.retrievalSources.includes('ast_tree'),
        ace: false,
      },
    });
  } catch (err) {
    console.error('[hyperrag-api] Error:', err);
    return emptyResult((err as Error).message, 500);
  }
};
