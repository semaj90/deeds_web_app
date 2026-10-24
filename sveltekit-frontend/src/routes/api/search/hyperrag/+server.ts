import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createSearchRuntime, type SearchResult } from '$lib/server/retrieval/search-runtime.js';
import { randomUUID } from 'node:crypto';
import { classifyAtlasQuery, packageOntologyLabelCandidatesV1, type QueryClassificationV1 } from '$lib/server/atlas/agentic-file-compiler/query-classifier.js';
import { enrichQueryClassificationWithOakV1 } from '$lib/server/atlas/agentic/oak-query-enrichment-v1.js';
import { resolveOntologyLabelV1 } from '$lib/server/atlas/ontology-resolution-boundary-postgres.js';
import type { HyperRagFusionRuntimeResultV1 } from '$lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.js';
import { ENV } from '$lib/server/env.server.js';
import { resolveTrustedWorkspaceAuthorityV1 } from '$lib/server/retrieval/trusted-workspace-authority-v1.js';

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
      synthesisStatus: 'UNAVAILABLE',
      proof: null,
      classification: null,
      retrievalPlan: null,
      ontologyQueryEvidence: [],
      workspaceAuthority: { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'NOT_EVALUATED', callerSuppliedWorkspaceContextIgnored: false },
      graphExpansionStatus: 'NOT_EVALUATED',
      hypergraph: { status: 'UNAVAILABLE', acceptedCandidateCount: 0, rejectedCandidateCount: 0, relationshipCount: 0, acePayloadCount: 0 },
      oakEvidence: [],
      error,
      provenance: { pgvector: false, qdrant: false, turbovec: false, redis: false, neo4j: false, ace: false },
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
    // Server-side only: the resolver never reads request workspace fields.
    const trustedWorkspace = await resolveTrustedWorkspaceAuthorityV1();
    const requestId = request.headers.get('x-request-id')?.trim() || `hyperrag:${randomUUID()}`;
    const classification: QueryClassificationV1 = classifyAtlasQuery({
      requestId,
      query: input.query,
      producerRevision: 'hyperrag-front-door-v1',
    });
    const retrievalPlan = null;
    const ontologyLabels = packageOntologyLabelCandidatesV1(classification.packageCandidates);
    const ontologyResolutions = await Promise.all(ontologyLabels.map((label) =>
      resolveOntologyLabelV1({ schemaVersion: 'atlas.ontology-resolution-request.v1', label })
    ));
    const resolvedOntologyLabels = ontologyResolutions
      .filter((resolution) => resolution.resolutionState === 'RESOLVED' && resolution.conceptId !== null)
      .map((resolution) => resolution.label);
    const lexicalExpansion = [...new Set([
      ...classification.ngrams,
      ...classification.packageCandidates,
      ...resolvedOntologyLabels,
    ])].slice(0, 32);
    // AR-07: additive OAK concept-evidence enrichment, called AFTER classification
    // (never inside classifyAtlasQuery itself, which stays synchronous). Bounded,
    // fail-closed -- a sidecar outage degrades to RESOLUTION_UNAVAILABLE entries,
    // never blocks or slows this route beyond its own timeout.
    const oakEnrichment = await enrichQueryClassificationWithOakV1(classification).catch(() => ({
      requestId,
      evidence: [],
    }));
    const runtime = createSearchRuntime({
      userId: locals.user.id,
      readOnly: true,
    });
    const result = await runtime.search({
      text: input.query,
      lexicalExpansion,
      topK: input.topK ?? 15,
      ...(input.useGraph && trustedWorkspace.status === 'TRUSTED'
        ? { workspaceRevision: trustedWorkspace.workspaceRevision }
        : {}),
      filters: {
        includeGenerated: false,
        includeLegacy: false,
      },
    });

    const hypergraph: HyperRagFusionRuntimeResultV1 = {
      status: 'UNAVAILABLE',
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 0,
      acePayloads: [],
      facade: null,
      reason: !input.useGraph
        ? 'HYPERRAG_GRAPH_NOT_REQUESTED'
        : trustedWorkspace.status !== 'TRUSTED'
          ? 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE'
          : 'SEARCH_RUNTIME_GRAPH_EXPANSION_DELEGATED',
    };
    const graphExpansionStatus = !input.useGraph
      ? 'NOT_REQUESTED'
      : trustedWorkspace.status !== 'TRUSTED'
        ? 'BLOCKED_TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE'
        : 'DELEGATED_TO_SEARCH_RUNTIME';

    const hypergraphByPacket = new Map<string, Record<string, unknown>>();

    const facts: [] = [];

    let synthesis: string | null = null;
    let synthesisStatus: 'BLOCKED_CONTEXT_MANIFEST_REQUIRED' | 'SYNTHESIS_UNAVAILABLE' | 'NOT_REQUESTED' = 'NOT_REQUESTED';

    if (input.synthesize) {
      synthesisStatus = 'BLOCKED_CONTEXT_MANIFEST_REQUIRED';
    }

    return json({
      query: result.metadata.query,
      variants: [input.query],
      hits: result.packets.map((packet) => toHyperRagHit(packet, hypergraphByPacket.get(packet.packet_key ?? ''))),
      facts,
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
      synthesisStatus,
      proof: result.proof ?? null,
      classification,
      retrievalPlan,
      ontologyQueryEvidence: ontologyResolutions.map((resolution) => ({
        ...resolution,
        canonicalAuthority: false,
      })),
      workspaceAuthority: {
        ...trustedWorkspace,
        callerSuppliedWorkspaceContextIgnored: Boolean(
          input.workspaceId || input.workspaceRevision || input.sourceRevision || input.representationId || input.representationRevision,
        ),
      },
      graphExpansionStatus,
      oakEvidence: oakEnrichment.evidence,
      hypergraph: {
        status: hypergraph.status,
        acceptedCandidateCount: hypergraph.acceptedCandidateCount,
        rejectedCandidateCount: hypergraph.rejectedCandidateCount,
        relationshipCount: hypergraph.facade?.relationships.length ?? 0,
        factCount: facts.length,
        acePayloadCount: hypergraph.acePayloads.length,
        sufficientContext: hypergraph.facade?.sufficient_context ?? null,
        reason: hypergraph.reason ?? null,
      },
      provenance: {
        pgvector: false,
        qdrant: result.provenance.retrievalSources.includes('qdrant'),
        turbovec: false,
        redis: Boolean(ENV.REDIS_URL || ENV.VALKEY_URL),
        neo4j: false,
        ace: false,
      },
    });
  } catch (err) {
    console.error('[hyperrag-api] Error:', err);
    return emptyResult('Search unavailable', 500);
  }
};
