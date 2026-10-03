import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createSearchRuntime, type SearchResult } from '$lib/server/retrieval/search-runtime.js';
import { bifrostChat, VLM_MODELS } from '$lib/server/ollama.js';
import { randomUUID } from 'node:crypto';
import { classifyAtlasQuery, type QueryClassificationV1 } from '$lib/server/atlas/agentic-file-compiler/query-classifier.js';
import { buildRetrievalPlan, type RetrievalPlanV1 } from '$lib/server/atlas/agentic-file-compiler/retrieval-plan.js';
import { pool } from '$lib/server/db/client.js';
import { createFeatureIntelligenceRepository } from '@deeds/parent-atlas';
import { runHyperRagFusionRuntimeV1, type HyperRagFusionRuntimeResultV1 } from '$lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.js';
import { enrichQueryClassificationWithOakV1 } from '$lib/server/atlas/agentic/oak-query-enrichment-v1.js';

const requestSchema = z.object({
  query: z.string().trim().min(1, 'Query string is required').max(1024, 'Query string is too long'),
  mode: z.enum(['codebase', 'evidence', 'legal', 'docs']).default('codebase'),
  workspaceId: z.string().trim().min(1).optional(),
  workspaceRevision: z.string().trim().min(1).optional(),
  sourceRevision: z.string().trim().min(1).optional(),
  representationId: z.string().trim().min(1).optional(),
  representationRevision: z.number().int().positive().optional(),
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
      proof: null,
      classification: null,
      retrievalPlan: null,
      hypergraph: { status: 'UNAVAILABLE', acceptedCandidateCount: 0, rejectedCandidateCount: 0, relationshipCount: 0, acePayloadCount: 0 },
      oakEvidence: [],
      error,
      provenance: { qdrant: false, turbovec: false, redis: false, neo4j: false, ace: false },
    },
    { status },
  );
}

function toHyperRagHit(packet: SearchResult['packets'][number], hypergraphPayload?: Record<string, unknown>) {
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
    payload: hypergraphPayload ? { ...enriched, ace_hypergraph: hypergraphPayload } : enriched as Record<string, unknown>,
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
    const requestId = request.headers.get('x-request-id')?.trim() || `hyperrag:${randomUUID()}`;
    const classification: QueryClassificationV1 = classifyAtlasQuery({
      requestId,
      query: input.query,
      producerRevision: 'hyperrag-front-door-v1',
    });
    const retrievalPlan: RetrievalPlanV1 | null = input.workspaceRevision
      ? buildRetrievalPlan({
          classification,
          workspaceRevision: input.workspaceRevision,
          candidateBudget: input.topK ?? 15,
          producerRevision: 'hyperrag-retrieval-plan-v1',
        })
      : null;
    // AR-07: additive OAK concept-evidence enrichment, called AFTER classification
    // (never inside classifyAtlasQuery itself, which stays synchronous). Bounded,
    // fail-closed -- a sidecar outage degrades to RESOLUTION_UNAVAILABLE entries,
    // never blocks or slows this route beyond its own timeout.
    const oakEnrichment = await enrichQueryClassificationWithOakV1(classification).catch(() => ({
      requestId,
      evidence: [],
    }));
    const runtime = createSearchRuntime({ userId: locals.user.id });
    const result = await runtime.search({
      text: input.query,
      topK: retrievalPlan?.candidateBudget ?? input.topK ?? 15,
      workspaceId: input.workspaceId,
      workspaceRevision: input.workspaceRevision,
      sourceRevision: input.sourceRevision,
      representationId: input.representationId,
      representationRevision: input.representationRevision,
      filters: {
        includeGenerated: false,
        includeLegacy: false,
      },
    });

    let hypergraph: HyperRagFusionRuntimeResultV1 = {
      status: 'UNAVAILABLE',
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 0,
      acePayloads: [],
      facade: null,
      reason: input.workspaceRevision ? 'HYPERRAG_HYPERGRAPH_DISABLED' : 'HYPERRAG_WORKSPACE_REVISION_REQUIRED',
    };
    if (input.useGraph === true && input.workspaceRevision) {
      hypergraph = await runHyperRagFusionRuntimeV1({
        queryId: requestId,
        workspaceRevision: input.workspaceRevision,
        producerRevision: 'hyperrag-live-fusion-v1',
        packets: result.packets.map((packet) => ({
          packet_key: packet.packet_key ?? null,
          source_ref: packet.source_ref ?? null,
          feature_id: packet.feature_id ?? null,
          relationship_id: (packet as any).relationship_id ?? null,
          evidence_id: (packet as any).evidence_id ?? null,
          score: (packet as any).blended_score ?? (packet as any).retrieval_score ?? null,
          workspace_revision: packet.workspace_revision ?? null,
          identity_status: (packet as any).identityStatus,
        })),
        repository: createFeatureIntelligenceRepository(
          pool as unknown as Parameters<typeof createFeatureIntelligenceRepository>[0],
        ),
      });
    }

    const hypergraphByPacket = new Map(
      hypergraph.acePayloads.map((payload) => [payload.packet_key, payload as unknown as Record<string, unknown>]),
    );

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
      hits: result.packets.map((packet) => toHyperRagHit(packet, hypergraphByPacket.get(packet.packet_key ?? ''))),
      graphPaths: (hypergraph.facade?.relationships ?? []).map((relationship) => ({
        relationshipId: relationship.relationship_id,
        relationshipType: relationship.relationship_type,
        participants: relationship.participants.map((participant) => ({
          role: participant.role,
          entityType: participant.entity_type,
          entityId: participant.entity_id,
        })),
        confidence: relationship.confidence,
      })),
      synthesis,
      proof: result.proof ?? null,
      classification,
      retrievalPlan,
      oakEvidence: oakEnrichment.evidence,
      hypergraph: {
        status: hypergraph.status,
        acceptedCandidateCount: hypergraph.acceptedCandidateCount,
        rejectedCandidateCount: hypergraph.rejectedCandidateCount,
        relationshipCount: hypergraph.facade?.relationships.length ?? 0,
        acePayloadCount: hypergraph.acePayloads.length,
        sufficientContext: hypergraph.facade?.sufficient_context ?? null,
        reason: hypergraph.reason ?? null,
      },
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
