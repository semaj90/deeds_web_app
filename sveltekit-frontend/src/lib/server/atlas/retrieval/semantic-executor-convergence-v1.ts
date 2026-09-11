import { createHash } from 'node:crypto';

export const SEMANTIC_EXECUTOR_CONVERGENCE_SCHEMA = 'atlas.semantic-executor-convergence.v1' as const;
export const SEMANTIC_REPRESENTATION_ID = 'semantic_768' as const;
export const SEMANTIC_DIMENSION = 768 as const;

export type SemanticExecutorId =
  | 'pgvector_exact'
  | 'pgvector_hnsw'
  | 'qdrant_exact'
  | 'qdrant_hnsw'
  | 'cuvs_exact'
  | 'cuvs_cagra'
  | 'turbovec';

export interface SemanticCandidateV1 {
  packetKey: string;
  canonicalChunkId: string;
  symbolVersionId?: string | null;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  representationId: typeof SEMANTIC_REPRESENTATION_ID;
  representationRevision: string;
  score: number;
  executorId: SemanticExecutorId;
  rank: number;
}

export interface SemanticExecutorRunV1 {
  executorId: SemanticExecutorId;
  representationId: typeof SEMANTIC_REPRESENTATION_ID;
  representationRevision: string;
  workspaceRevision: string;
  queryVectorChecksum: string;
  candidates: SemanticCandidateV1[];
  durationMs: number;
  peakMemoryBytes?: number | null;
  peakVramBytes?: number | null;
}

export interface SemanticExecutorComparisonV1 {
  executorId: SemanticExecutorId;
  recallAt10: number | null;
  recallAt50: number | null;
  top10Overlap: number | null;
  top50Overlap: number | null;
  identityQualified: boolean;
  durationMs: number;
  peakMemoryBytes: number | null;
  peakVramBytes: number | null;
  blockers: string[];
}

export interface SemanticConvergenceReceiptV1 {
  schema: typeof SEMANTIC_EXECUTOR_CONVERGENCE_SCHEMA;
  representationId: typeof SEMANTIC_REPRESENTATION_ID;
  dimension: typeof SEMANTIC_DIMENSION;
  workspaceRevision: string;
  representationRevision: string;
  queryVectorChecksum: string;
  oracleExecutor: 'pgvector_exact' | 'qdrant_exact' | 'cuvs_exact';
  comparisons: SemanticExecutorComparisonV1[];
  selectedExecutor: SemanticExecutorId | null;
  logicalLane: 'semantic';
  rrfVoteCount: 1;
  status: 'SEMANTIC_EXECUTOR_CONVERGENCE_PROVEN' | 'SEMANTIC_EXECUTOR_CONVERGENCE_BLOCKED';
  blockers: string[];
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function identityKey(candidate: SemanticCandidateV1): string {
  return `${candidate.packetKey}\0${candidate.canonicalChunkId}\0${candidate.sourceRevision}`;
}

function assertRun(run: SemanticExecutorRunV1): void {
  if (run.representationId !== SEMANTIC_REPRESENTATION_ID) {
    throw new Error('SEMANTIC_EXECUTOR_REPRESENTATION_MISMATCH');
  }
  if (!clean(run.workspaceRevision) || !clean(run.representationRevision) || !clean(run.queryVectorChecksum)) {
    throw new Error('SEMANTIC_EXECUTOR_REVISION_IDENTITY_REQUIRED');
  }
  const seen = new Set<string>();
  for (const candidate of run.candidates) {
    if (
      !clean(candidate.packetKey)
      || !clean(candidate.canonicalChunkId)
      || !clean(candidate.sourceRef)
      || !clean(candidate.sourceRevision)
      || !clean(candidate.workspaceRevision)
      || !clean(candidate.representationRevision)
    ) {
      throw new Error('SEMANTIC_CANDIDATE_CANONICAL_IDENTITY_REQUIRED');
    }
    if (candidate.representationId !== SEMANTIC_REPRESENTATION_ID) {
      throw new Error('SEMANTIC_CANDIDATE_REPRESENTATION_MISMATCH');
    }
    if (candidate.workspaceRevision !== run.workspaceRevision) {
      throw new Error('SEMANTIC_CANDIDATE_WORKSPACE_REVISION_MISMATCH');
    }
    if (candidate.representationRevision !== run.representationRevision) {
      throw new Error('SEMANTIC_CANDIDATE_REPRESENTATION_REVISION_MISMATCH');
    }
    if (!Number.isFinite(candidate.score) || !Number.isInteger(candidate.rank) || candidate.rank < 1) {
      throw new Error('SEMANTIC_CANDIDATE_SCORE_OR_RANK_INVALID');
    }
    const key = identityKey(candidate);
    if (seen.has(key)) throw new Error(`SEMANTIC_CANDIDATE_DUPLICATE_IDENTITY:${key}`);
    seen.add(key);
  }
}

function topKeys(run: SemanticExecutorRunV1, k: number): string[] {
  return [...run.candidates]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, k)
    .map(identityKey);
}

function overlapFraction(reference: string[], candidate: string[]): number | null {
  if (reference.length === 0) return null;
  const candidateSet = new Set(candidate);
  let overlap = 0;
  for (const key of reference) if (candidateSet.has(key)) overlap++;
  return overlap / reference.length;
}

export function checksumSemanticQueryVectorV1(vector: readonly number[]): string {
  if (vector.length !== SEMANTIC_DIMENSION || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`SEMANTIC_QUERY_VECTOR_INVALID: expected ${SEMANTIC_DIMENSION} finite values`);
  }
  return createHash('sha256').update(JSON.stringify(vector)).digest('hex');
}

export function compareSemanticExecutorRunsV1(
  oracle: SemanticExecutorRunV1,
  challengers: SemanticExecutorRunV1[],
  options: { minimumRecallAt10?: number; minimumRecallAt50?: number; selectedExecutor?: SemanticExecutorId | null } = {},
): SemanticConvergenceReceiptV1 {
  assertRun(oracle);
  if (!['pgvector_exact', 'qdrant_exact', 'cuvs_exact'].includes(oracle.executorId)) {
    throw new Error('SEMANTIC_ORACLE_MUST_BE_EXACT_EXECUTOR');
  }

  const min10 = options.minimumRecallAt10 ?? 0.99;
  const min50 = options.minimumRecallAt50 ?? 0.99;
  const oracle10 = topKeys(oracle, 10);
  const oracle50 = topKeys(oracle, 50);
  const comparisons: SemanticExecutorComparisonV1[] = [];
  const blockers: string[] = [];

  for (const run of challengers) {
    assertRun(run);
    const runBlockers: string[] = [];
    if (run.workspaceRevision !== oracle.workspaceRevision) runBlockers.push('WORKSPACE_REVISION_MISMATCH');
    if (run.representationRevision !== oracle.representationRevision) runBlockers.push('REPRESENTATION_REVISION_MISMATCH');
    if (run.queryVectorChecksum !== oracle.queryVectorChecksum) runBlockers.push('QUERY_VECTOR_CHECKSUM_MISMATCH');

    const recallAt10 = overlapFraction(oracle10, topKeys(run, 10));
    const recallAt50 = overlapFraction(oracle50, topKeys(run, 50));
    if (recallAt10 != null && recallAt10 < min10) runBlockers.push('RECALL_AT_10_BELOW_GATE');
    if (recallAt50 != null && recallAt50 < min50) runBlockers.push('RECALL_AT_50_BELOW_GATE');

    comparisons.push({
      executorId: run.executorId,
      recallAt10,
      recallAt50,
      top10Overlap: recallAt10,
      top50Overlap: recallAt50,
      identityQualified: runBlockers.every((code) => !code.endsWith('_MISMATCH')),
      durationMs: run.durationMs,
      peakMemoryBytes: run.peakMemoryBytes ?? null,
      peakVramBytes: run.peakVramBytes ?? null,
      blockers: runBlockers,
    });
    blockers.push(...runBlockers.map((code) => `${run.executorId}:${code}`));
  }

  const selectedExecutor = options.selectedExecutor ?? null;
  if (selectedExecutor && selectedExecutor !== oracle.executorId && !challengers.some((run) => run.executorId === selectedExecutor)) {
    blockers.push('SELECTED_EXECUTOR_NOT_MEASURED');
  }

  return {
    schema: SEMANTIC_EXECUTOR_CONVERGENCE_SCHEMA,
    representationId: SEMANTIC_REPRESENTATION_ID,
    dimension: SEMANTIC_DIMENSION,
    workspaceRevision: oracle.workspaceRevision,
    representationRevision: oracle.representationRevision,
    queryVectorChecksum: oracle.queryVectorChecksum,
    oracleExecutor: oracle.executorId,
    comparisons,
    selectedExecutor,
    logicalLane: 'semantic',
    rrfVoteCount: 1,
    status: blockers.length === 0 ? 'SEMANTIC_EXECUTOR_CONVERGENCE_PROVEN' : 'SEMANTIC_EXECUTOR_CONVERGENCE_BLOCKED',
    blockers: [...new Set(blockers)],
  };
}
