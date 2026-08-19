import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { traverseGraphV1 } from '$lib/server/atlas/graph/graph-traversal.js';
import { loadGraphFeatureSnapshotV1 } from '$lib/server/atlas/graph/graph-feature-snapshot.js';
import { createAtlasRapidsMemoryClient } from '$lib/server/atlas/gpu/atlas-rapids-memory-client.js';
import { planGpuResidencyV1 } from '$lib/server/atlas/gpu/gpu-residency-budget.js';
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

function nullableScore(value: number | null): number {
  return value == null || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value;
}

function compareCandidates(a: CandidateFeatureRowV1, b: CandidateFeatureRowV1): number {
  if (a.exactSymbolMatch !== b.exactSymbolMatch) return b.exactSymbolMatch - a.exactSymbolMatch;
  const ppr = nullableScore(b.personalizedPageRank) - nullableScore(a.personalizedPageRank);
  if (Number.isFinite(ppr) && ppr !== 0) return ppr;
  const pr = nullableScore(b.globalPageRank) - nullableScore(a.globalPageRank);
  if (Number.isFinite(pr) && pr !== 0) return pr;
  if (a.graphHopDistance !== b.graphHopDistance) return a.graphHopDistance - b.graphHopDistance;
  return a.nodeKey.localeCompare(b.nodeKey);
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as AtlasSynthesisRequestV1;
    if (!body.snapshotId?.trim()) {
      return json({ ok: false, error: 'snapshotId is required' }, { status: 400 });
    }
    if (!body.query?.trim()) {
      return json({ ok: false, error: 'query is required' }, { status: 400 });
    }
    if (!Array.isArray(body.seedNodeKeys) || body.seedNodeKeys.length === 0) {
      return json({ ok: false, error: 'seedNodeKeys must contain at least one node' }, { status: 400 });
    }

    const candidateLimit = boundedInt(body.candidateLimit, DEFAULT_CANDIDATE_LIMIT, 1, MAX_CANDIDATES);
    const tokenBudget = boundedInt(body.tokenBudget, DEFAULT_TOKEN_BUDGET, 256, MAX_TOKEN_BUDGET);

    const rapids = createAtlasRapidsMemoryClient();
    const gpuTelemetry = await rapids.readTelemetry();
    const gpuBudget = planGpuResidencyV1(gpuTelemetry, candidateLimit);

    const graph = await traverseGraphV1({
      schema: 'atlas.graph-traverse-request.v1',
      snapshotId: body.snapshotId,
      seedNodeKeys: body.seedNodeKeys,
      maxHops: body.maxHops ?? 2,
      maxNodes: candidateLimit,
      direction: 'both',
      edgeTypes: body.edgeTypes,
    });

    const graphFeatureErrors: string[] = [];
    let graphFeatures = new Map<
      string,
      {
        packetKey: string;
        graphRevision: string;
        pagerank: number | null;
        personalizedPageRank: number | null;
        communityId: string | null;
        algorithmRevisions: string[];
      }
    >();

    const packetKeys = graph.nodes
      .map((node) => node.packetKey)
      .filter((packetKey): packetKey is string => Boolean(packetKey));

    if (body.graphRevision?.trim() && packetKeys.length > 0) {
      try {
        graphFeatures = await loadGraphFeatureSnapshotV1(packetKeys, body.graphRevision.trim());
      } catch (error) {
        graphFeatureErrors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const seedSet = new Set(body.seedNodeKeys);
    const candidates: CandidateFeatureRowV1[] = graph.nodes.map((node, candidateOrdinal) => {
      const staticGraph = node.packetKey ? graphFeatures.get(node.packetKey) : undefined;
      return {
        candidateOrdinal,
        canonicalId: `${body.snapshotId}:${node.id}`,
        packetKey: node.packetKey,
        nodeKey: node.id,
        sourceRef: node.sourceRef,
        semanticCosine: null,
        lexicalScore: null,
        exactSymbolMatch: seedSet.has(node.id) ? 1 : 0,
        astMatch: null,
        personalizedPageRank: staticGraph?.personalizedPageRank ?? null,
        graphHopDistance: node.hop,
        globalPageRank: staticGraph?.pagerank ?? null,
        communityId: staticGraph?.communityId ?? null,
        typeCompatibility: null,
        revisionMatch: body.graphRevision ? (staticGraph ? 1 : 0) : 1,
        bitfrostHotness: null,
      };
    });

    candidates.sort(compareCandidates);

    // If GPU pressure cannot admit the requested bucket, use the strongest
    // revision-qualified prefix that fits. If no GPU lease exists, keep the
    // full bounded set and route scoring to Qdrant/CPU instead of dropping data.
    const executionCandidateLimit =
      gpuBudget.executionTarget === 'gpu' && gpuBudget.maxCandidateBucket != null
        ? Math.min(candidates.length, gpuBudget.maxCandidateBucket)
        : candidates.length;
    const executionCandidates = candidates.slice(0, executionCandidateLimit).map((candidate, ordinal) => ({
      ...candidate,
      candidateOrdinal: ordinal,
    }));

    const candidateBucket = chooseCandidateBucket(Math.max(1, executionCandidates.length));
    const requestId = graph.queryId;
    const manifest: ContextManifestV1 = {
      schema: 'atlas.context-manifest.v1',
      requestId,
      snapshotId: body.snapshotId,
      graphRevision: body.graphRevision?.trim() || null,
      query: body.query.trim(),
      candidateBucket,
      candidateCount: executionCandidates.length,
      tokenBudget,
      selectedNodeKeys: executionCandidates.map((candidate) => candidate.nodeKey),
      evidenceRefs: executionCandidates
        .filter((candidate) => candidate.sourceRef)
        .map((candidate) => `${candidate.sourceRef}#${candidate.nodeKey}`),
      producerRevision: 'atlas.graph-synthesis-prep.v2',
    };

    return json({
      ok: true,
      status: 'PROMOTION_REQUIRED',
      graph,
      candidates: executionCandidates,
      manifest,
      gpuPlan: {
        architecture: 'sm_86',
        semanticDimensions: 768,
        requestedCandidateCount: candidates.length,
        executionCandidateCount: executionCandidates.length,
        bucket: candidateBucket,
        rowPadding: candidateBucket - executionCandidates.length,
        executionTarget: gpuBudget.executionTarget,
        degraded: gpuBudget.degraded,
        reason: gpuBudget.reason,
        residency: gpuBudget,
        stages: ['semantic_768', 'graph_features', 'exact_promotion', 'context_manifest'],
      },
      graphFeatures: {
        graphRevision: body.graphRevision?.trim() || null,
        hydrated: graphFeatures.size,
        errors: graphFeatureErrors,
      },
      retrievalPlan: {
        dense: 'codebase_chunks_768_v2/content (canonical semantic_768 cold/warm projection)',
        bm25: 'canonical lexical lane outside Qdrant semantic ownership',
        bm42: 'codebase_chunks_384_hybrid/bm42 experimental challenger only',
        fallback: gpuBudget.executionTarget === 'qdrant' ? 'qdrant' : null,
      },
      next: {
        semantic: 'Populate semanticCosine from codebase_chunks_768_v2 or the exact cuVS executor, then exact-promote the winning packet identities.',
        graph: body.graphRevision
          ? 'Static graph metrics were read only from the requested graphRevision; query-time PPR may overwrite personalizedPageRank only with its own receipt.'
          : 'Provide graphRevision to hydrate persisted PageRank/community features; do not infer it from snapshotId.',
        lexical: 'Keep BM25 canonical; treat BM42 as challenger evidence without an independent identity vote.',
        cache: 'Populate bitfrostHotness from revision-qualified Redis/Valkey hot state.',
        promotion: 'Hydrate exact source/AST/type evidence before invoking the synthesis model.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 400 });
  }
};
