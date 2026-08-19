import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { traverseGraphV1 } from '$lib/server/atlas/graph/graph-traversal.js';
import { loadGraphFeatureSnapshotV1 } from '$lib/server/atlas/graph/graph-feature-snapshot.js';
import { createAtlasRapidsPageRankClient } from '$lib/server/atlas/graph/atlas-rapids-pagerank-client.js';
import { createAtlasRapidsMemoryClient } from '$lib/server/atlas/gpu/atlas-rapids-memory-client.js';
import { planGpuResidencyV1 } from '$lib/server/atlas/gpu/gpu-residency-budget.js';
import { createAtlasRapidsSemantic512Client } from '$lib/server/atlas/retrieval/atlas-rapids-semantic512-client.js';
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

    const pagerankClient = createAtlasRapidsPageRankClient();
    const shouldRunQueryPpr =
      gpuBudget.executionTarget === 'gpu' &&
      Boolean(body.graphRevision?.trim()) &&
      graph.nodes.length > 0;

    const [semanticResult, lexicalResult, pprResult] = await Promise.allSettled([
      packetKeys.length > 0
        ? scoreQdrantSemanticCandidatesV1(body.query.trim(), packetKeys, candidateLimit)
        : Promise.resolve(null),
      packetKeys.length > 0
        ? scorePostgresLexicalCandidatesV1(body.query.trim(), packetKeys, candidateLimit)
        : Promise.resolve(null),
      shouldRunQueryPpr
        ? pagerankClient.pagerank({
            graphRevision: body.graphRevision!.trim(),
            seeds: body.seedNodeKeys.map((nodeKey) => ({ nodeKey, weight: 1 })),
            candidateNodeKeys: graph.nodes.map((node) => node.id),
            topK: Math.min(candidateLimit, graph.nodes.length),
            alpha: 0.85,
            tol: 1e-6,
            maxIter: 100,
            deadlineMs: 5_000,
          })
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
    const pprReceipt = pprResult.status === 'fulfilled' ? pprResult.value : null;
    const pprErrors = pprResult.status === 'rejected'
      ? [pprResult.reason instanceof Error ? pprResult.reason.message : String(pprResult.reason)]
      : [];

    // Qdrant is the persistent/online candidate executor. When GPU residency
    // permits it, exact-rerank the very same bounded semantic_512 rows with
    // cuVS cosine before semanticCosine enters the feature matrix.
    const exactSemanticErrors: string[] = [];
    let exactSemanticReceipt: Awaited<ReturnType<ReturnType<typeof createAtlasRapidsSemantic512Client>['exactKnn']>> | null = null;
    const exactEligibleRows = (semanticReceipt?.scores ?? []).filter(
      (score) => Boolean(score.packetKey && score.sourceRevision && score.vector.length === 512),
    );
    const shouldRunExactSemantic =
      gpuBudget.executionTarget === 'gpu' &&
      Boolean(semanticReceipt?.queryVector.length === 512) &&
      exactEligibleRows.length > 0;

    if (shouldRunExactSemantic && semanticReceipt) {
      try {
        const exactClient = createAtlasRapidsSemantic512Client();
        exactSemanticReceipt = await exactClient.exactKnn({
          query: {
            vector: semanticReceipt.queryVector,
            representationId: 'semantic_512',
            representationRevision: semanticReceipt.representationRevision,
          },
          corpus: exactEligibleRows.map((score) => ({
            packetKey: score.packetKey,
            sourceRevision: score.sourceRevision!,
            symbolVersionId: score.symbolVersionId,
            treeNodeId: score.treeNodeId,
            featureLabel: score.featureLabel,
            vector: score.vector,
          })),
          topK: Math.min(candidateLimit, exactEligibleRows.length),
          deadlineMs: 5_000,
        });
      } catch (error) {
        exactSemanticErrors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const qdrantSemanticByPacket = new Map(
      (semanticReceipt?.scores ?? []).map((score) => [score.packetKey, score]),
    );
    const exactSemanticByPacket = new Map(
      (exactSemanticReceipt?.results ?? []).map((score) => [score.packetKey, score]),
    );
    const lexicalByPacket = new Map(
      (lexicalReceipt?.scores ?? []).map((score) => [score.packetKey, score]),
    );
    const pprByNode = new Map(
      (pprReceipt?.results ?? []).map((score) => [score.nodeKey, score]),
    );

    const seedSet = new Set(body.seedNodeKeys);
    const candidates: CandidateFeatureRowV1[] = graph.nodes.map((node, candidateOrdinal) => {
      const staticGraph = node.packetKey ? graphFeatures.get(node.packetKey) : undefined;
      const qdrantSemantic = node.packetKey ? qdrantSemanticByPacket.get(node.packetKey) : undefined;
      const exactSemantic = node.packetKey ? exactSemanticByPacket.get(node.packetKey) : undefined;
      const lexical = node.packetKey ? lexicalByPacket.get(node.packetKey) : undefined;
      const queryPpr = pprByNode.get(node.id);
      return {
        candidateOrdinal,
        canonicalId: `${body.snapshotId}:${node.id}`,
        packetKey: node.packetKey,
        nodeKey: node.id,
        sourceRef: node.sourceRef,
        semanticCosine: exactSemantic?.cosineSimilarity ?? qdrantSemantic?.score ?? null,
        lexicalScore: lexical?.score ?? null,
        exactSymbolMatch: seedSet.has(node.id) ? 1 : 0,
        astMatch: null,
        personalizedPageRank: queryPpr?.score ?? staticGraph?.personalizedPageRank ?? null,
        graphHopDistance: node.hop,
        globalPageRank: staticGraph?.pagerank ?? null,
        communityId: staticGraph?.communityId ?? null,
        typeCompatibility: null,
        revisionMatch: body.graphRevision ? (staticGraph || queryPpr ? 1 : 0) : 1,
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
      producerRevision: 'atlas.graph-synthesis-prep.v6-semantic512',
    };

    // Do not serialize raw 512d vectors back to the Admin UI. Keep only the
    // projection/query metadata needed to explain the retrieval decision.
    const semanticPublicReceipt = semanticReceipt
      ? {
          schema: semanticReceipt.schema,
          collection: semanticReceipt.collection,
          vectorName: semanticReceipt.vectorName,
          representationId: semanticReceipt.representationId,
          representationRevision: semanticReceipt.representationRevision,
          dimension: semanticReceipt.dimension,
          requestedPacketKeys: semanticReceipt.requestedPacketKeys,
          returnedPacketKeys: semanticReceipt.returnedPacketKeys,
          embeddingModel: semanticReceipt.embeddingModel,
          embeddingCached: semanticReceipt.embeddingCached,
          embeddingExecMs: semanticReceipt.embeddingExecMs,
          scores: semanticReceipt.scores.map(({ vector: _vector, ...score }) => score),
        }
      : null;

    return json({
      ok: true,
      status: 'PROMOTION_REQUIRED',
      graph,
      candidates: executionCandidates,
      manifest,
      gpuPlan: {
        architecture: 'sm_86',
        semanticDimensions: 512,
        nativeEmbeddingModelDimensions: 768,
        requestedCandidateCount: candidates.length,
        executionCandidateCount: executionCandidates.length,
        bucket: candidateBucket,
        rowPadding: candidateBucket - executionCandidates.length,
        executionTarget: gpuBudget.executionTarget,
        degraded: gpuBudget.degraded,
        reason: gpuBudget.reason,
        residency: gpuBudget,
        stages: ['semantic_512', 'cuvs_exact_cosine', 'lexical', 'personalized_pagerank', 'graph_features', 'exact_promotion', 'context_manifest'],
      },
      semantic: {
        qdrant: { receipt: semanticPublicReceipt, errors: semanticErrors },
        exactCuvs: {
          requested: shouldRunExactSemantic,
          eligibleRows: exactEligibleRows.length,
          receipt: exactSemanticReceipt,
          errors: exactSemanticErrors,
        },
      },
      lexical: { receipt: lexicalReceipt, errors: lexicalErrors },
      personalizedPageRank: {
        requested: shouldRunQueryPpr,
        receipt: pprReceipt,
        errors: pprErrors,
      },
      graphFeatures: {
        graphRevision: body.graphRevision?.trim() || null,
        hydrated: graphFeatures.size,
        errors: graphFeatureErrors,
      },
      retrievalPlan: {
        dense: 'codebase_chunks_512 (canonical persisted EmbeddingGemma MRL semantic_512, cosine)',
        exactDense: shouldRunExactSemantic ? 'cuVS brute_force cosine over the same bounded semantic_512 candidate rows' : null,
        routing: 'latent_64 autoencoder + KMeans is routing-only and requires its own revision receipt before use',
        lexical: 'PostgreSQL atlas_packets FTS via websearch_to_tsquery + ts_rank_cd',
        queryGraph: shouldRunQueryPpr ? 'resident cuGraph personalized PageRank over the requested graphRevision' : null,
        bm42: 'codebase_chunks_384_hybrid/bm42 experimental challenger only',
        fallback: gpuBudget.executionTarget === 'qdrant' ? 'qdrant' : null,
      },
      next: {
        semantic: exactSemanticReceipt
          ? 'semanticCosine is exact cuVS cosine over the bounded canonical semantic_512 candidate fabric.'
          : semanticReceipt
            ? 'semanticCosine currently uses Qdrant cosine because exact cuVS was skipped/failed; backfill packet_key+source_revision to make all 512 rows exact-rerank eligible.'
            : 'Qdrant semantic_512 enrichment failed open; do not fabricate semanticCosine.',
        lexical: lexicalReceipt
          ? 'lexicalScore is hydrated by the existing canonical PostgreSQL FTS semantics; BM42 remains challenger-only.'
          : 'PostgreSQL lexical enrichment failed open; BM42 must not silently become the canonical lexical score.',
        graph: pprReceipt
          ? 'personalizedPageRank is query-time cuGraph output from the exact requested graphRevision; persisted PageRank/community remain static priors.'
          : body.graphRevision
            ? 'Query-time PPR failed open or GPU policy skipped it; only revision-qualified persisted graph features may remain.'
            : 'Provide graphRevision to hydrate persisted graph features and enable query-time PPR; never infer it from snapshotId.',
        routing: 'Train semantic_512→latent_64, run deterministic KMeans, then prove routed Recall@K against the full semantic_512 cuVS oracle before enabling cluster prefiltering.',
        cache: 'bitfrostHotness remains null until live invalidation/residency semantics are proven; key existence is not relevance.',
        promotion: 'Hydrate exact source/AST/type evidence before invoking the synthesis model.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 400 });
  }
};
