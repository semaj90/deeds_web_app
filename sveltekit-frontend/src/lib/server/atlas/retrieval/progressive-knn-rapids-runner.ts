import { createAtlasRapidsKnnClient, type AtlasKnnCorpusRow, type AtlasKnnHit } from './atlas-rapids-knn-client.js';
import type {
  KnnGraphEdgeV1,
  ProgressiveCandidateV1,
  ProgressiveKnnGraphPlanV1,
} from './progressive-knn-graph-contracts.js';

export type QdrantPromotedVectorRowV1 = {
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  symbolVersionId?: string | null;
  qdrantPointId?: string | null;
  semantic768Score: number;
  vector768: number[];
  evidenceRefs?: string[];
};

export type DerivedLatentScoreRowV1 = {
  canonicalId: string;
  latent128Score?: number | null;
  latent64Score?: number | null;
};

export type ProgressiveRapidsRunV1 = {
  schema: 'atlas.progressive-rapids-run.v1';
  candidates: ProgressiveCandidateV1[];
  exactQueryHits: AtlasKnnHit[];
  challengerQueryHits: AtlasKnnHit[];
  knnEdges: KnnGraphEdgeV1[];
  challengerRecallAtK: number | null;
  graphNodeCount: number;
  sidecarCallCount: number;
  graphTruncated: boolean;
  exactPromotionRequired: true;
  canonicalWrites: false;
};

function assertVector(row: QdrantPromotedVectorRowV1): void {
  if (row.vector768.length !== 768 || row.vector768.some((value) => !Number.isFinite(value))) {
    throw new Error(`semantic_768 vector invalid for ${row.canonicalId}`);
  }
  if (!Number.isFinite(row.semantic768Score)) throw new Error(`semantic_768 score invalid for ${row.canonicalId}`);
}

function identityKey(packetKey: string, sourceRevision: string): string {
  return `${packetKey}\0${sourceRevision}`;
}

function recallAtK(exact: readonly AtlasKnnHit[], challenger: readonly AtlasKnnHit[], k: number): number {
  const exactKeys = new Set(exact.slice(0, k).map((hit) => identityKey(hit.packetKey, hit.sourceRevision)));
  if (exactKeys.size === 0) return 1;
  const challengerKeys = new Set(challenger.slice(0, k).map((hit) => identityKey(hit.packetKey, hit.sourceRevision)));
  let overlap = 0;
  for (const key of exactKeys) if (challengerKeys.has(key)) overlap += 1;
  return overlap / exactKeys.size;
}

async function mapWithConcurrency<T, R>(
  rows: readonly T[],
  concurrency: number,
  fn: (row: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(rows.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, rows.length || 1)) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= rows.length) return;
      results[index] = await fn(rows[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Execute the bounded semantic GPU ladder after Qdrant has already produced a
 * revision-qualified prefetch set.
 *
 * Exact brute force always sees the entire prefetched corpus. Derived latent
 * scores are annotations/routing hints only; they never prune the exact oracle.
 */
export async function runProgressiveRapidsKnn(input: {
  plan: ProgressiveKnnGraphPlanV1;
  queryVector768: number[];
  qdrantPrefetch: readonly QdrantPromotedVectorRowV1[];
  latentScores?: readonly DerivedLatentScoreRowV1[];
  sidecarBaseUrl?: string;
  graphBuildNodeLimit?: number;
  graphBuildConcurrency?: number;
  deadlineMs?: number;
}): Promise<ProgressiveRapidsRunV1> {
  if (input.queryVector768.length !== 768 || input.queryVector768.some((value) => !Number.isFinite(value))) {
    throw new Error('queryVector768 must be a finite semantic_768 vector');
  }
  const plan = input.plan;
  if (plan.semanticRepresentation.representationId !== 'semantic_768') {
    throw new Error('RAPIDS semantic oracle requires semantic_768 execution identity');
  }

  const prefetch = [...input.qdrantPrefetch]
    .map((row) => ({ ...row, evidenceRefs: [...new Set(row.evidenceRefs ?? [])].sort() }))
    .sort((a, b) => b.semantic768Score - a.semantic768Score || a.canonicalId.localeCompare(b.canonicalId))
    .slice(0, plan.qdrantPrefetchK);
  if (prefetch.length < plan.exactK) {
    throw new Error(`Qdrant prefetch returned ${prefetch.length} rows, fewer than exactK=${plan.exactK}`);
  }

  const byIdentity = new Map<string, QdrantPromotedVectorRowV1>();
  const byCanonical = new Map<string, QdrantPromotedVectorRowV1>();
  for (const row of prefetch) {
    assertVector(row);
    if (row.workspaceRevision !== plan.workspaceRevision) throw new Error(`workspace revision mismatch for ${row.canonicalId}`);
    const ikey = identityKey(row.packetKey, row.sourceRevision);
    if (byIdentity.has(ikey)) throw new Error(`duplicate Qdrant promoted identity: ${ikey}`);
    if (byCanonical.has(row.canonicalId)) throw new Error(`duplicate Qdrant canonicalId: ${row.canonicalId}`);
    byIdentity.set(ikey, row);
    byCanonical.set(row.canonicalId, row);
  }

  const latentByCanonical = new Map((input.latentScores ?? []).map((row) => [row.canonicalId, row] as const));
  const corpus: AtlasKnnCorpusRow[] = prefetch.map((row) => ({
    packetKey: row.packetKey,
    sourceRevision: row.sourceRevision,
    symbolVersionId: row.symbolVersionId ?? null,
    vector: row.vector768,
  }));
  const client = createAtlasRapidsKnnClient(input.sidecarBaseUrl);
  const deadlineMs = input.deadlineMs ?? 15_000;

  const exactPromise = client.exact({
    vector: input.queryVector768,
    representationId: 'semantic_768',
    dimension: 768,
    corpus,
    topK: plan.exactK,
    deadlineMs,
  });
  const challengerPromise = plan.challengerExecutor === 'CUVS_CAGRA'
    ? client.cagra({
        vector: input.queryVector768,
        representationId: 'semantic_768',
        dimension: 768,
        corpus,
        topK: plan.challengerK,
        deadlineMs,
      })
    : Promise.resolve(null);

  const [exactResponse, challengerResponse] = await Promise.all([exactPromise, challengerPromise]);
  const exactQueryHits = exactResponse.results;
  const challengerQueryHits = challengerResponse?.results ?? [];

  const exactDistance = new Map(exactQueryHits.map((hit) => [identityKey(hit.packetKey, hit.sourceRevision), hit.distance] as const));
  const challengerDistance = new Map(challengerQueryHits.map((hit) => [identityKey(hit.packetKey, hit.sourceRevision), hit.distance] as const));

  // Promotion order is owned by the exact oracle. Qdrant/latent scores remain evidence.
  const promotedRows = exactQueryHits.map((hit) => {
    const source = byIdentity.get(identityKey(hit.packetKey, hit.sourceRevision));
    if (!source) throw new Error(`RAPIDS exact hit escaped Qdrant prefetch identity set: ${hit.packetKey}`);
    return source;
  });

  const candidates: ProgressiveCandidateV1[] = promotedRows.map((row) => {
    const latent = latentByCanonical.get(row.canonicalId);
    const key = identityKey(row.packetKey, row.sourceRevision);
    return {
      canonicalId: row.canonicalId,
      packetKey: row.packetKey,
      sourceRef: row.sourceRef,
      workspaceRevision: row.workspaceRevision,
      sourceRevision: row.sourceRevision,
      qdrantPointId: row.qdrantPointId ?? null,
      semantic768Score: row.semantic768Score,
      latent128Score: latent?.latent128Score ?? null,
      latent64Score: latent?.latent64Score ?? null,
      exactDistance: exactDistance.get(key) ?? null,
      challengerDistance: challengerDistance.get(key) ?? null,
      evidenceRefs: [...new Set([
        ...(row.evidenceRefs ?? []),
        `rapids:exact:${hitIdentity(row.packetKey, row.sourceRevision)}`,
      ])].sort(),
    };
  });

  // Candidate-to-candidate graph construction is deliberately bounded. Each
  // source node asks the exact semantic oracle for neighbors only within the
  // exact-promoted corpus, never the full repository.
  const graphBuildNodeLimit = Math.max(1, Math.min(
    input.graphBuildNodeLimit ?? 256,
    candidates.length,
  ));
  const graphSources = candidates.slice(0, graphBuildNodeLimit);
  const graphCorpusRows = graphSources.map((candidate) => {
    const row = byCanonical.get(candidate.canonicalId);
    if (!row) throw new Error(`missing vector for promoted graph node ${candidate.canonicalId}`);
    return {
      packetKey: row.packetKey,
      sourceRevision: row.sourceRevision,
      symbolVersionId: row.symbolVersionId ?? null,
      vector: row.vector768,
    } satisfies AtlasKnnCorpusRow;
  });
  const graphIdentity = new Map(graphSources.map((candidate) => [identityKey(candidate.packetKey, candidate.sourceRevision), candidate] as const));
  const neighborK = Math.min(plan.graphNeighborK + 1, graphCorpusRows.length);

  const perSourceEdges = await mapWithConcurrency(
    graphSources,
    input.graphBuildConcurrency ?? 4,
    async (source): Promise<KnnGraphEdgeV1[]> => {
      const vector = byCanonical.get(source.canonicalId)?.vector768;
      if (!vector) throw new Error(`missing graph source vector ${source.canonicalId}`);
      const response = await client.exact({
        vector,
        representationId: 'semantic_768',
        dimension: 768,
        corpus: graphCorpusRows,
        topK: neighborK,
        deadlineMs,
      });
      const edges: KnnGraphEdgeV1[] = [];
      for (const hit of response.results) {
        const target = graphIdentity.get(identityKey(hit.packetKey, hit.sourceRevision));
        if (!target || target.canonicalId === source.canonicalId) continue;
        edges.push({
          sourceCanonicalId: source.canonicalId,
          targetCanonicalId: target.canonicalId,
          rank: edges.length + 1,
          distance: hit.distance,
          metric: 'COSINE',
          executor: 'CUVS_BRUTE_FORCE',
          exact: true,
        });
        if (edges.length >= plan.graphNeighborK) break;
      }
      return edges;
    },
  );

  const knnEdges = perSourceEdges.flat();
  const challengerRecallAtK = challengerResponse
    ? recallAtK(exactQueryHits, challengerQueryHits, Math.min(plan.exactK, plan.challengerK))
    : null;

  return {
    schema: 'atlas.progressive-rapids-run.v1',
    candidates,
    exactQueryHits,
    challengerQueryHits,
    knnEdges,
    challengerRecallAtK,
    graphNodeCount: graphSources.length,
    sidecarCallCount: 1 + (challengerResponse ? 1 : 0) + graphSources.length,
    graphTruncated: graphSources.length < candidates.length,
    exactPromotionRequired: true,
    canonicalWrites: false,
  };
}

function hitIdentity(packetKey: string, sourceRevision: string): string {
  return `${packetKey}@${sourceRevision}`;
}
