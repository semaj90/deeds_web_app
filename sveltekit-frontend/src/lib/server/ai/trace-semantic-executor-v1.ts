import type {
  AtlasSemantic768ExactHitV1,
  AtlasSemantic768ExactReceiptV1,
} from '$lib/server/atlas/retrieval/atlas-rapids-semantic768-client.js';

export type TraceSemanticCohortRowV1 = {
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  vector: number[];
};

export type TraceSemanticHitV1 = {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
};

export type TraceSemanticExecutionResultV1 = {
  status: 'READY' | 'BLOCKED';
  logicalLane: 'semantic';
  voteKey: 'semantic';
  voteCount: 1;
  executor: 'QDRANT' | 'CUVS_EXACT' | null;
  fallbackUsed: boolean;
  hits: TraceSemanticHitV1[];
  reason: string | null;
  writesPerformed: false;
};

export type TraceSemanticExecutorInputV1 = {
  admittedWorkspaceRevision: string;
  semanticRepresentationRevision: string;
  queryVector: number[];
  topK: number;
  qdrantSearch: () => Promise<TraceSemanticHitV1[]>;
  loadCohort: (workspaceRevision: string) => Promise<TraceSemanticCohortRowV1[]>;
  cuvsExact: (input: {
    query: { vector: number[]; representationId: 'semantic_768'; representationRevision: string };
    corpus: Array<{
      packetKey: string;
      sourceRevision: string;
      symbolVersionId?: string | null;
      vector: number[];
    }>;
    topK: number;
  }) => Promise<AtlasSemantic768ExactReceiptV1>;
};

function blocked(reason: string): TraceSemanticExecutionResultV1 {
  return {
    status: 'BLOCKED', logicalLane: 'semantic', voteKey: 'semantic', voteCount: 1,
    executor: null, fallbackUsed: false, hits: [], reason, writesPerformed: false,
  };
}

function validateCohort(rows: TraceSemanticCohortRowV1[], expectedWorkspaceRevision: string): string | null {
  if (!expectedWorkspaceRevision.trim()) return 'ADMITTED_WORKSPACE_REVISION_REQUIRED';
  if (rows.length === 0) return 'CURRENT_SEMANTIC_COHORT_EMPTY';
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.canonicalId || !row.packetKey || !row.sourceRef) return 'COHORT_CANONICAL_IDENTITY_MISSING';
    if (row.workspaceRevision !== expectedWorkspaceRevision) return 'COHORT_WORKSPACE_REVISION_MISMATCH';
    if (!row.sourceRevision) return 'COHORT_SOURCE_REVISION_MISSING';
    if (row.vector.length !== 768) return 'COHORT_SEMANTIC_768_DIMENSION_MISMATCH';
    const identity = `${row.packetKey}\u0000${row.sourceRevision}`;
    if (seen.has(identity)) return 'COHORT_DUPLICATE_PACKET_SOURCE_REVISION';
    seen.add(identity);
  }
  return null;
}

function mapCuvsHits(
  receipt: AtlasSemantic768ExactReceiptV1,
  cohort: TraceSemanticCohortRowV1[],
): TraceSemanticHitV1[] {
  const byPacket = new Map(cohort.map((row) => [row.packetKey, row]));
  return receipt.results.flatMap((hit: AtlasSemantic768ExactHitV1) => {
    const row = byPacket.get(hit.packetKey);
    if (!row || row.sourceRevision !== hit.sourceRevision) return [];
    return [{
      id: row.canonicalId,
      score: hit.cosineSimilarity,
      payload: {
        canonical_id: row.canonicalId,
        packet_key: row.packetKey,
        source_ref: row.sourceRef,
        workspace_revision: row.workspaceRevision,
        source_revision: row.sourceRevision,
        representation_id: 'semantic_768',
        executor: 'CUVS_EXACT',
      },
    }];
  });
}

/**
 * Qdrant-first TRACE semantic execution with an identity-preserving cuVS
 * fallback. The fallback is deliberately unavailable unless its caller can
 * supply an admitted, single-revision cohort; no legacy payload is promoted.
 */
export async function executeTraceSemanticV1(
  input: TraceSemanticExecutorInputV1,
): Promise<TraceSemanticExecutionResultV1> {
  if (input.queryVector.length !== 768 || input.queryVector.some((value) => !Number.isFinite(value))) {
    return blocked('CUVS_FALLBACK_QUERY_SEMANTIC_768_INVALID');
  }
  try {
    const hits = await input.qdrantSearch();
    return {
      status: 'READY', logicalLane: 'semantic', voteKey: 'semantic', voteCount: 1,
      executor: 'QDRANT', fallbackUsed: false, hits, reason: null, writesPerformed: false,
    };
  } catch {
    let cohort: TraceSemanticCohortRowV1[];
    try {
      cohort = await input.loadCohort(input.admittedWorkspaceRevision);
    } catch {
      return blocked('CUVS_FALLBACK_COHORT_LOAD_FAILED');
    }
    const validationError = validateCohort(cohort, input.admittedWorkspaceRevision);
    if (validationError) return blocked(`CUVS_FALLBACK_${validationError}`);

    const receipt = await input.cuvsExact({
      query: {
        vector: input.queryVector,
        representationId: 'semantic_768',
        representationRevision: input.semanticRepresentationRevision,
      },
      corpus: cohort.map((row) => ({
        packetKey: row.packetKey,
        sourceRevision: row.sourceRevision,
        vector: row.vector,
      })),
      topK: Math.min(input.topK, cohort.length),
    });
    return {
      status: 'READY', logicalLane: 'semantic', voteKey: 'semantic', voteCount: 1,
      executor: 'CUVS_EXACT',
      fallbackUsed: true,
      hits: mapCuvsHits(receipt, cohort),
      reason: null,
      writesPerformed: false,
    };
  }
}
