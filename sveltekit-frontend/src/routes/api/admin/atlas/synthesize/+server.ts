import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { traverseGraphV1 } from '$lib/server/atlas/graph/graph-traversal.js';
import { loadGraphFeatureSnapshotV1 } from '$lib/server/atlas/graph/graph-feature-snapshot.js';
import { createAtlasRapidsMemoryClient } from '$lib/server/atlas/gpu/atlas-rapids-memory-client.js';
import { planGpuResidencyV1 } from '$lib/server/atlas/gpu/gpu-residency-budget.js';
import { scoreQdrantSemanticCandidatesV1 } from '$lib/server/atlas/retrieval/qdrant-semantic-scorer.js';
import { scorePostgresLexicalCandidatesV1 } from '$lib/server/atlas/retrieval/postgres-lexical-scorer.js';
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
  const semantic = nullableScore(b.semanticCosine) - nullableScore(a.semanticCosine);
  if (Number.isFinite(semantic) && semantic !== 0) return semantic;
  const lexical = nullableScore(b.lexicalScore) - nullableScore(a.lexicalScore);
  if (Number.isFinite(lexical) && lexical !== 0) return lexical;
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

    const [semanticResult, lexicalResult] = await Promise.allSettled([
      packetKeys.length > 0
        ? scoreQdrantSemanticCandidatesV1(body.query.trim(), packetKeys, candidateLimit)
        : Promise.resolve(null),
      packetKeys.length > 0
        ? scorePostgresLexicalCandidatesV1(body.query.trim(), packetKeys, candidateLimit)
        : Promise.resolve(null),
    ]);

    const semanticReceipt = semanticResult.status === 'fulfilled' ? semanticResult.value : null;
    const semanticErrors = semanticResult.status === 'rejected'
      ? [semanticResult.reason instanceof Error ? semanticResult.reason.message : String(semanticResult.reason)]
      : [];
    const lexicalReceipt = lexicalResult.status === 'fulfilled' ? lexicalResult.value : null;
    const lexicalErrors = lexicalResult.status === 'rejected'
      ? [lexicalResult.reason instanceof Error ? lexicalResult.reason.message : String(lexicalResult.reason)]
      : [];

    const semanticByPacket = new Map(
      (semanticReceipt?.scores ?? []).map((score) => [score.packetKey, score]),
    );
    const lexicalByPacket = new Map(
      (lexicalReceipt?.scores ?? []).map((score) => [score.packetKey, score]),
    );

    const seedSet = new Set(body.seedNodeKeys);
    const candidates: CandidateFeatureRowV1[] = graph.nodes.map((node, candidateOrdinal) => {
      const staticGraph = node.packetKey ? graphFeatures.get(node.packetKey) : undefined;
      const semantic = node.packetKey ? semanticByPacket.get(node.packetKey) : undefined;
      const lexical = node.packetKey ? lexicalByPacket.get(node.packetKey) : undefined;
      return {
        candidateOrdinal,
        canonicalId: `${body.snapshotId}:${node.id}`,
        packetKey: node.packetKey,
        nodeKey: node.id,
        sourceRef: node.sourceRef,
        semanticCosine: semantic?.score ?? null,
        lexicalScore: lexical?.score ?? null,
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
      producerRevision: 'atlas.graph-synthesis-prep.v4',
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
        stages: ['semantic_768', 'lexical', 'graph_features', 'exact_promotion', 'context_manifest'],
      },
      semantic: { receipt: semanticReceipt, errors: semanticErrors },
      lexical: { receipt: lexicalReceipt, errors: lexicalErrors },
      graphFeatures: {
        graphRevision: body.graphRevision?.trim() || null,
        hydrated: graphFeatures.size,
        errors: graphFeatureErrors,
      },
      retrievalPlan: {
        dense: 'codebase_chunks_768_v2/content (canonical semantic_768 cold/warm projection)',
        lexical: 'PostgreSQL atlas_packets FTS via websearch_to_tsquery + ts_rank_cd',
        bm42: 'codebase_chunks_384_hybrid/bm42 experimental challenger only',
        fallback: gpuBudget.executionTarget === 'qdrant' ? 'qdrant' : null,
      },
      next: {
        semantic: semanticReceipt
          ? 'semanticCosine is hydrated from the canonical semantic_768 Qdrant projection for bounded graph candidate identities.'
          : 'Qdrant semantic enrichment failed open; do not fabricate semanticCosine.',
        lexical: lexicalReceipt
          ? 'lexicalScore is hydrated by the existing canonical PostgreSQL FTS semantics; BM42 remains challenger-only.'
          : 'PostgreSQL lexical enrichment failed open; BM42 must not silently become the canonical lexical score.',
        graph: body.graphRevision
          ? 'Static graph metrics were read only from the requested graphRevision; query-time PPR may overwrite personalizedPageRank only with its own receipt.'
          : 'Provide graphRevision to hydrate persisted PageRank/community features; do not infer it from snapshotId.',
        cache: 'bitfrostHotness remains null until live invalidation/residency semantics are proven; key existence is not relevance.',
        promotion: 'Hydrate exact source/AST/type evidence before invoking the synthesis model.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 400 });
  }
};
