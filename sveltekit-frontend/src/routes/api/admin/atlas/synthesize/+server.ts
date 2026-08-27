import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { traverseGraphV1 } from '$lib/server/atlas/graph/graph-traversal.js';
import { loadGraphFeatureSnapshotV1 } from '$lib/server/atlas/graph/graph-feature-snapshot.js';
import { loadMutationAwarenessV1 } from '$lib/server/atlas/graph/mutation-awareness.js';
import { createAtlasRapidsPageRankClient, type AtlasPageRankReceiptV1, type AtlasPageRankResultV1 } from '$lib/server/atlas/graph/atlas-rapids-pagerank-client.js';
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
  type SourceMutationStatusV1,
} from '$lib/server/atlas/graph/graph-runtime-contracts.js';
import { requireAdmin } from '$lib/server/auth-utils.js';

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

function isExecutableMutationStatus(status: SourceMutationStatusV1): boolean {
  return status !== 'STALE' && status !== 'MISSING';
}

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  const { request } = event;
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

    const mutationErrors: string[] = [];
    let mutationAwareness: Awaited<ReturnType<typeof loadMutationAwarenessV1>> | null = null;
    try {
      mutationAwareness = await loadMutationAwarenessV1(body.snapshotId, graph.nodes);
    } catch (error) {
      mutationErrors.push(error instanceof Error ? error.message : String(error));
    }

    const mutationByNode = new Map(
      (mutationAwareness?.entries ?? []).map((entry) => [entry.nodeKey, entry]),
    );
    const mutationByPacket = new Map(
      (mutationAwareness?.entries ?? [])
        .filter((entry) => entry.packetKey)
        .map((entry) => [entry.packetKey!, entry]),
    );

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
    const pprReceipt: AtlasPageRankReceiptV1 | null = pprResult.status === 'fulfilled'
      ? pprResult.value as AtlasPageRankReceiptV1 | null
      : null;
    const pprErrors = pprResult.status === 'rejected'
      ? [pprResult.reason instanceof Error ? pprResult.reason.message : String(pprResult.reason)]
      : [];

    // Exact semantic ranking and source freshness are independent proofs. A row
    // does not need a fabricated source_revision to be scored exactly, but a
    // known STALE/MISSING source is not allowed into the CUDA promotion set.
    const exactSemanticErrors: string[] = [];
    let exactSemanticReceipt: Awaited<ReturnType<ReturnType<typeof createAtlasRapidsSemantic512Client>['exactKnn']>> | null = null;
    const graphSourceRefByPacket = new Map(
      graph.nodes
        .filter((node) => node.packetKey)
        .map((node) => [node.packetKey!, node.sourceRef]),
    );
    const exactEligibleRows = (semanticReceipt?.scores ?? []).filter((score) => {
      if (!score.packetKey || score.vector.length !== 512) return false;
      const mutation = mutationByPacket.get(score.packetKey);
      return !mutation || isExecutableMutationStatus(mutation.status);
    });
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
            // Restored 2026-08-26: commit a2e4dab329 ("retire Atlas v1 in
            // favor of v2/semantic_768 alignment") mechanically flipped this
            // literal to 'semantic_768' without updating the client call,
            // leaving it inconsistent with createAtlasRapidsSemantic512Client()
            // and the vector.length === 512 filter a few lines above. This is
            // the legitimate 512-dim exact-rerank secondary lane (policy-
            // compliant per root CLAUDE.md's Aug 23 truncation rule) — 768
            // remains canonical/primary elsewhere and is unaffected by this fix.
            representationId: 'semantic_512',
            representationRevision: semanticReceipt.representationRevision,
          },
          corpus: exactEligibleRows.map((score) => ({
            packetKey: score.packetKey,
            sourceRevision: score.sourceRevision,
            sourceRef: graphSourceRefByPacket.get(score.packetKey) ?? null,
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
    const pprByNode = new Map<string, AtlasPageRankResultV1>(
      (pprReceipt?.results ?? []).map((score) => [score.nodeKey, score]),
    );

    const seedSet = new Set(body.seedNodeKeys);
    const allCandidates: CandidateFeatureRowV1[] = graph.nodes.map((node, candidateOrdinal) => {
      const staticGraph = node.packetKey ? graphFeatures.get(node.packetKey) : undefined;
      const qdrantSemantic = node.packetKey ? qdrantSemanticByPacket.get(node.packetKey) : undefined;
      const exactSemantic = node.packetKey ? exactSemanticByPacket.get(node.packetKey) : undefined;
      const lexical = node.packetKey ? lexicalByPacket.get(node.packetKey) : undefined;
      const queryPpr = pprByNode.get(node.id);
      const mutation = mutationByNode.get(node.id) ?? (node.packetKey ? mutationByPacket.get(node.packetKey) : undefined);
      const sourceMutationStatus: SourceMutationStatusV1 = mutation?.status ?? 'UNKNOWN';
      return {
        candidateOrdinal,
        canonicalId: `${body.snapshotId}:${node.id}`,
        packetKey: node.packetKey,
        nodeKey: node.id,
        sourceRef: node.sourceRef,
        sourceMutationStatus,
        sourceFreshnessProven: sourceMutationStatus === 'FRESH',
        semanticCosine: exactSemantic?.cosineSimilarity ?? (qdrantSemantic as { score?: number } | undefined)?.score ?? null,
        lexicalScore: (lexical as { score?: number } | undefined)?.score ?? null,
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

    // Stale/missing source occurrences remain visible in the mutation receipt but
    // cannot enter the execution DAG/context manifest. UNKNOWN remains rankable
    // so incomplete historical hash coverage does not destroy recall; exact
    // source promotion must still resolve it before model synthesis.
    const excludedByMutation = allCandidates.filter(
      (candidate) => !isExecutableMutationStatus(candidate.sourceMutationStatus),
    );
    const candidates = allCandidates.filter(
      (candidate) => isExecutableMutationStatus(candidate.sourceMutationStatus),
    );
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
    const staleNodeKeys = (mutationAwareness?.entries ?? [])
      .filter((entry) => entry.status === 'STALE' || entry.status === 'MISSING')
      .map((entry) => entry.nodeKey);
    const unknownNodeKeys = (mutationAwareness?.entries ?? [])
      .filter((entry) => entry.status === 'UNKNOWN')
      .map((entry) => entry.nodeKey);
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
      mutationAwareness: {
        proofPolicy: 'content-hash-plus-tracked-git-provenance',
        freshCount: mutationAwareness?.freshCount ?? 0,
        staleCount: mutationAwareness?.staleCount ?? 0,
        unknownCount: mutationAwareness?.unknownCount ?? graph.nodes.length,
        missingCount: mutationAwareness?.missingCount ?? 0,
        staleNodeKeys,
        unknownNodeKeys,
      },
      producerRevision: 'atlas.graph-synthesis-prep.v7-semantic512-mutation-aware',
    };

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

    const hasExecutableCandidates = executionCandidates.length > 0;
    const hasUnknownFreshness = executionCandidates.some((candidate) => !candidate.sourceFreshnessProven);

    return json({
      ok: true,
      status: !hasExecutableCandidates
        ? 'REHYDRATION_REQUIRED'
        : hasUnknownFreshness
          ? 'PROMOTION_REQUIRED_SOURCE_FRESHNESS'
          : 'PROMOTION_REQUIRED',
      graph,
      candidates: executionCandidates,
      excludedByMutation,
      manifest,
      mutationAwareness: {
        receipt: mutationAwareness,
        errors: mutationErrors,
        policy: {
          fresh: 'rankable; eligible for source promotion',
          unknown: 'rankable; source freshness must be promoted before synthesis',
          stale: 'excluded from execution candidates; rehydrate/reindex first',
          missing: 'excluded from execution candidates; restore canonical packet first',
        },
      },
      gpuPlan: {
        architecture: 'sm_86',
        semanticDimensions: 512,
        nativeEmbeddingModelDimensions: 768,
        requestedCandidateCount: allCandidates.length,
        mutationEligibleCandidateCount: candidates.length,
        executionCandidateCount: executionCandidates.length,
        bucket: candidateBucket,
        rowPadding: candidateBucket - executionCandidates.length,
        executionTarget: gpuBudget.executionTarget,
        degraded: gpuBudget.degraded || excludedByMutation.length > 0 || hasUnknownFreshness,
        reason: excludedByMutation.length > 0
          ? `${excludedByMutation.length} stale/missing source candidates excluded before execution; ${gpuBudget.reason}`
          : hasUnknownFreshness
            ? `source freshness remains unknown for at least one candidate; ${gpuBudget.reason}`
            : gpuBudget.reason,
        residency: gpuBudget,
        stages: ['source_ref_mutation_gate', 'semantic_768', 'cuvs_exact_cosine_v2', 'lexical', 'personalized_pagerank', 'graph_features', 'exact_promotion', 'context_manifest'],
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
        sourceFreshness: 'source_ref + trusted snapshot sha256 + git_mutation_provenance; no fabricated source_revision',
        dense: 'codebase_chunks_768_v2 (persisted EmbeddingGemma native semantic_768, cosine)',
        exactDense: shouldRunExactSemantic ? 'cuVS brute_force cosine v2 over bounded non-stale semantic_768 rows' : null,
        routing: 'latent_64 autoencoder + KMeans is routing-only and requires its own revision receipt before use',
        lexical: 'PostgreSQL atlas_packets FTS via websearch_to_tsquery + ts_rank_cd',
        queryGraph: shouldRunQueryPpr ? 'resident cuGraph personalized PageRank over the requested graphRevision' : null,
        bm42: 'codebase_chunks_384_hybrid/bm42 experimental challenger only',
        fallback: gpuBudget.executionTarget === 'qdrant' ? 'qdrant' : null,
      },
      next: {
        mutation: excludedByMutation.length > 0
          ? 'Rehydrate/reindex stale source_ref occurrences before they may enter the DAG.'
          : hasUnknownFreshness
            ? 'Promote UNKNOWN source occurrences against current source content/AST before invoking the model.'
            : 'Selected source occurrences are freshness-proven against available mutation evidence.',
        semantic: exactSemanticReceipt
          ? 'semanticCosine is exact cuVS cosine over the bounded semantic_768 candidate fabric; source freshness remains a separate receipt.'
          : semanticReceipt
            ? 'semanticCosine currently uses Qdrant cosine because exact cuVS was skipped/failed; do not conflate this with source freshness.'
            : 'Qdrant semantic_768 enrichment failed open; do not fabricate semanticCosine.',
        lexical: lexicalReceipt
          ? 'lexicalScore is hydrated by PostgreSQL FTS; BM42 remains challenger-only.'
          : 'PostgreSQL lexical enrichment failed open; BM42 must not silently become the canonical lexical score.',
        graph: pprReceipt
          ? 'personalizedPageRank is query-time cuGraph output from the requested graphRevision; persisted PageRank/community remain static priors.'
          : body.graphRevision
            ? 'Query-time PPR failed open or GPU policy skipped it; only revision-qualified persisted graph features may remain.'
            : 'Provide graphRevision to hydrate persisted graph features and enable query-time PPR; never infer it from snapshotId.',
        routing: 'Train semantic_768→latent_64, run deterministic KMeans, then prove routed Recall@K against full semantic_768 cuVS exact before enabling cluster prefiltering.',
        cache: 'BitFrost/Valkey entries must be keyed by snapshot/representation/mutation evidence before they can be trusted after a source change.',
        promotion: 'Hydrate exact current source/AST/type evidence; UNKNOWN freshness must not reach the synthesis model.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 400 });
  }
};
