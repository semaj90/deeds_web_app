import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { traverseGraphV1 } from '$lib/server/atlas/graph/graph-traversal.js';
import {
  chooseCandidateBucket,
  type AtlasSynthesisRequestV1,
  type CandidateFeatureRowV1,
  type ContextManifestV1,
} from '$lib/server/atlas/graph/graph-runtime-contracts.js';

const DEFAULT_CANDIDATE_LIMIT = 128;
const MAX_CANDIDATES = 512;
const DEFAULT_TOKEN_BUDGET = 8_192;
const MAX_TOKEN_BUDGET = 32_768;

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value as number)));
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as AtlasSynthesisRequestV1;
    if (!body.query?.trim()) {
      return json({ ok: false, error: 'query is required' }, { status: 400 });
    }

    const candidateLimit = boundedInt(body.candidateLimit, DEFAULT_CANDIDATE_LIMIT, 1, MAX_CANDIDATES);
    const tokenBudget = boundedInt(body.tokenBudget, DEFAULT_TOKEN_BUDGET, 256, MAX_TOKEN_BUDGET);

    const graph = await traverseGraphV1({
      schema: 'atlas.graph-traverse-request.v1',
      snapshotId: body.snapshotId,
      seedNodeKeys: body.seedNodeKeys,
      maxHops: body.maxHops ?? 2,
      maxNodes: candidateLimit,
      direction: 'both',
      edgeTypes: body.edgeTypes,
    });

    const seedSet = new Set(body.seedNodeKeys);
    const candidates: CandidateFeatureRowV1[] = graph.nodes.map((node, candidateOrdinal) => ({
      candidateOrdinal,
      canonicalId: `${body.snapshotId}:${node.id}`,
      packetKey: node.packetKey,
      nodeKey: node.id,
      sourceRef: node.sourceRef,
      semanticCosine: null,
      lexicalScore: null,
      exactSymbolMatch: seedSet.has(node.id) ? 1 : 0,
      astMatch: null,
      personalizedPageRank: null,
      graphHopDistance: node.hop,
      globalPageRank: null,
      typeCompatibility: null,
      revisionMatch: 1,
      bitfrostHotness: null,
    }));

    const candidateBucket = chooseCandidateBucket(candidates.length);
    const requestId = graph.queryId;
    const manifest: ContextManifestV1 = {
      schema: 'atlas.context-manifest.v1',
      requestId,
      snapshotId: body.snapshotId,
      query: body.query.trim(),
      candidateBucket,
      candidateCount: candidates.length,
      tokenBudget,
      selectedNodeKeys: candidates.map((candidate) => candidate.nodeKey),
      evidenceRefs: candidates
        .filter((candidate) => candidate.sourceRef)
        .map((candidate) => `${candidate.sourceRef}#${candidate.nodeKey}`),
      producerRevision: 'atlas.graph-synthesis-prep.v1',
    };

    return json({
      ok: true,
      status: 'PROMOTION_REQUIRED',
      graph,
      candidates,
      manifest,
      gpuPlan: {
        architecture: 'sm_86',
        semanticDimensions: 768,
        bucket: candidateBucket,
        rowPadding: candidateBucket - candidates.length,
        stages: ['semantic_768', 'graph_features', 'exact_promotion', 'context_manifest'],
      },
      next: {
        semantic: 'Populate semanticCosine from the canonical semantic_768 executor.',
        graph: 'Populate personalizedPageRank/globalPageRank from the revision-qualified graph projection.',
        cache: 'Populate bitfrostHotness from revision-qualified Redis/Valkey hot state.',
        promotion: 'Hydrate exact source/AST/type evidence before invoking the synthesis model.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 400 });
  }
};
