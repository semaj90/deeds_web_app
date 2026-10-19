import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  candidateOrdinalMapV1Schema,
  assertCandidateOrdinalMapIntegrityV1,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import type { CandidateFeatureColumnarV1 } from '../features/candidate-feature-columnar-v1.js';
import type { candidateFeatureHeadV1Schema } from '../features/candidate-feature-gemm-v1.js';
import {
  buildAtlasRankInputV1,
  scoreAtlasRankInputWithFeaturesGemm,
  type AtlasRankInputV1,
  type AtlasRankScoringReceiptV1,
  type ValidateRankInputOptions,
} from './atlas-rank-input-adapter-v1.js';

/**
 * Top-K execution receipt for `atlas_algorithm_execution_receipts` (DOC-ANALYSIS-TABLES-02).
 *
 * Scope: a real CPU exact Top-K over the 4-candidate x 6-feature tile scores. The receipt records WHAT RAN
 * (backend `cpu`, algorithm `cpu_exact`); it never claims GPU execution. An execution receipt is evidence of a
 * run, not independent verification: `verifyTopKExecutionReceiptV1` replays the whole CPU path from the sealed
 * map and columnar and returns a separate verdict. No retrieval fusion, no canonical writes.
 */
export const TOPK_EXECUTION_SCHEMA = 'atlas.topk.execution.v1' as const;
export const TOPK_VERIFIER_ID = 'topk-cpu-replay-verifier-v1' as const;
export const TOPK_ALGORITHM_CPU_EXACT = 'cpu_exact' as const;

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);

export const TopKSelectionSchema = z.object({
  canonicalId: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  score: z.number().finite(),
  rank: z.number().int().positive(),
}).strict();
export type TopKSelectionV1 = z.infer<typeof TopKSelectionSchema>;

export const TopKExecutionSchema = z.object({
  schema: z.literal(TOPK_EXECUTION_SCHEMA),
  requestId: z.string().min(1),
  executionId: z.string().regex(/^topk:[a-f0-9]{64}$/),
  workspaceRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  sourceRevisionSetChecksum: hex64,
  representationRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  taxonomyRevision: z.string().min(1),
  featureSchemaRevision: z.string().min(1),
  evidenceRevision: z.string().min(1),
  algorithm: z.literal(TOPK_ALGORITHM_CPU_EXACT),
  backend: z.literal('cpu'),
  k: z.number().int().min(1).max(100),
  headId: z.string().min(1),
  /** Ranking input order (preserved through scoring). */
  candidateOrdinals: z.array(z.number().int().nonnegative()).min(1).max(4096),
  candidateSetDigest: hex64,
  ordinalMapDigest: hex64,
  columnarChecksum: hex64,
  tileDigest: hex64,
  scoreVectorDigest: hex64,
  selected: z.array(TopKSelectionSchema),
  outputDigest: hex64,
  /** CPU exact is the oracle itself, so there is no separate oracle digest or parity claim. */
  parityVerified: z.literal(false),
  status: z.enum(['PASS', 'FAIL']),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  gpuExecuted: z.literal(false),
}).strict();
export type TopKExecutionV1 = z.infer<typeof TopKExecutionSchema>;

/** Timing is observational and is excluded from every checksum so a re-run is idempotent. */
export interface TopKTimingV1 { durationNs: string }

export interface AlgorithmExecutionReceiptRowV1 {
  execution_id: string;
  workflow_id: string | null;
  action_id: string | null;
  dag_node_id: string;
  stage: string;
  logical_lane: string;
  algorithm_class: string;
  algorithm: string;
  geometry: string;
  metric: string;
  compute_backend: string;
  compilation_mode: string;
  transport: string;
  serialization: string;
  source_snapshot_revision: string;
  representation_revision: string | null;
  graph_snapshot_revision: string | null;
  relationship_snapshot_revision: string | null;
  input_checksum: string;
  output_checksum: string | null;
  manifest_checksum: string;
  manifest: { execution: TopKExecutionV1; timing: TopKTimingV1 };
}

/** Minimal DB client: satisfied by `pg.Pool`, `pg.PoolClient`, and the in-memory test double. */
export interface SqlClientV1 {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

/**
 * Exact CPU Top-K. Order: score descending, then ordinal ascending (documented, deterministic tie-break).
 * Rejects: length mismatch, non-finite scores, duplicate ordinals or canonical ids, k < 1. A missing score is a
 * length mismatch (there is no default value). `k` larger than N returns all N.
 */
export function runCpuExactTopK(input: {
  candidateOrdinals: readonly number[];
  canonicalIds: readonly string[];
  scores: readonly number[];
  k: number;
}): TopKSelectionV1[] {
  const { candidateOrdinals, canonicalIds, scores, k } = input;
  if (!Number.isInteger(k) || k < 1) throw new Error('TOPK_K_INVALID');
  const n = candidateOrdinals.length;
  if (n < 1) throw new Error('TOPK_EMPTY_CANDIDATE_SET');
  if (canonicalIds.length !== n || scores.length !== n) throw new Error('TOPK_LENGTH_MISMATCH');
  if (new Set(candidateOrdinals).size !== n) throw new Error('TOPK_DUPLICATE_ORDINAL');
  if (new Set(canonicalIds).size !== n) throw new Error('TOPK_DUPLICATE_CANONICAL_ID');
  for (let i = 0; i < n; i += 1) {
    if (!Number.isInteger(candidateOrdinals[i]) || (candidateOrdinals[i] as number) < 0) throw new Error(`TOPK_ORDINAL_INVALID:${i}`);
    if (!Number.isFinite(scores[i])) throw new Error(`TOPK_NONFINITE_SCORE:${candidateOrdinals[i]}`);
  }
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => (scores[b] as number) - (scores[a] as number) || (candidateOrdinals[a] as number) - (candidateOrdinals[b] as number));
  return order.slice(0, Math.min(k, n)).map((index, position) => ({
    canonicalId: canonicalIds[index] as string,
    ordinal: candidateOrdinals[index] as number,
    score: scores[index] as number,
    rank: position + 1,
  }));
}

function deriveCanonicalIds(map: CandidateOrdinalMapV1, ordinals: readonly number[]): string[] {
  return ordinals.map((ordinal) => {
    const candidate = map.candidates[ordinal];
    if (!candidate || candidate.candidateOrdinal !== ordinal) throw new Error(`TOPK_ORDINAL_NOT_IN_SEALED_MAP:${ordinal}`);
    return candidate.canonicalId;
  });
}

function executionDigests(args: {
  ordinals: readonly number[];
  canonicalIds: readonly string[];
  ordinalMapChecksum: string;
  scores: readonly number[];
  selected: readonly TopKSelectionV1[];
}) {
  return {
    candidateSetDigest: canonicalSha256V1({ schema: 'atlas.topk.candidate-set.v1', ordinalMapChecksum: args.ordinalMapChecksum, ordinals: args.ordinals, canonicalIds: args.canonicalIds }),
    scoreVectorDigest: canonicalSha256V1({ schema: 'atlas.topk.score-vector.v1', scores: args.scores }),
    outputDigest: canonicalSha256V1({ schema: 'atlas.topk.output.v1', selected: args.selected }),
  };
}

/** Everything in the manifest that determines the result; used for the idempotent execution id. */
function executionIdentity(execution: Omit<TopKExecutionV1, 'executionId'>): string {
  return `topk:${canonicalSha256V1({ schema: 'atlas.topk.execution-identity.v1', execution })}`;
}

export function buildTopKExecutionV1(params: {
  requestId: string;
  input: AtlasRankInputV1;
  scored: AtlasRankScoringReceiptV1;
  ordinalMap: CandidateOrdinalMapV1;
  k: number;
}): TopKExecutionV1 {
  const { input, scored, ordinalMap, k } = params;
  const ordinals = scored.candidateOrdinals;
  const canonicalIds = deriveCanonicalIds(ordinalMap, ordinals);
  const selected = runCpuExactTopK({ candidateOrdinals: ordinals, canonicalIds, scores: scored.scores, k });
  const digests = executionDigests({ ordinals, canonicalIds, ordinalMapChecksum: ordinalMap.ordinalMapChecksum, scores: scored.scores, selected });
  const sourceRevisionSetChecksum = canonicalSha256V1({
    schema: 'atlas.topk.source-revision-set.v1',
    revisions: [...new Set(scored.sourceRevisions)].sort(),
  });
  const body = {
    schema: TOPK_EXECUTION_SCHEMA,
    requestId: params.requestId,
    workspaceRevision: scored.workspaceRevision,
    candidateSnapshotRevision: scored.candidateSnapshotRevision,
    sourceRevisionSetChecksum,
    representationRevision: scored.featureRevision,
    graphRevision: scored.graphRevision,
    taxonomyRevision: scored.taxonomyRevision,
    featureSchemaRevision: scored.featureSchemaRevision,
    evidenceRevision: scored.evidenceRevision,
    algorithm: TOPK_ALGORITHM_CPU_EXACT,
    backend: 'cpu',
    k,
    headId: scored.headId,
    candidateOrdinals: [...ordinals],
    candidateSetDigest: digests.candidateSetDigest,
    ordinalMapDigest: ordinalMap.ordinalMapChecksum,
    columnarChecksum: input.columnarChecksum,
    tileDigest: scored.tileDigest,
    scoreVectorDigest: digests.scoreVectorDigest,
    selected,
    outputDigest: digests.outputDigest,
    parityVerified: false,
    status: 'PASS',
    canonicalAuthority: false,
    writesPerformed: false,
    gpuExecuted: false,
  } as const;
  return TopKExecutionSchema.parse({ ...body, executionId: executionIdentity(body as unknown as Omit<TopKExecutionV1, 'executionId'>) });
}

export function topKManifestChecksumV1(execution: TopKExecutionV1): string {
  return canonicalSha256V1({ schema: 'atlas.topk.manifest.v1', execution });
}

export function topKInputChecksumV1(execution: TopKExecutionV1): string {
  return canonicalSha256V1({
    schema: 'atlas.topk.input.v1',
    candidateSetDigest: execution.candidateSetDigest,
    ordinalMapDigest: execution.ordinalMapDigest,
    columnarChecksum: execution.columnarChecksum,
    tileDigest: execution.tileDigest,
    scoreVectorDigest: execution.scoreVectorDigest,
    headId: execution.headId,
    k: execution.k,
  });
}

/** Maps the execution to the EXISTING table columns (no new columns). */
export function toAlgorithmExecutionReceiptRowV1(execution: TopKExecutionV1, timing: TopKTimingV1): AlgorithmExecutionReceiptRowV1 {
  return {
    execution_id: execution.executionId,
    workflow_id: null,
    action_id: null,
    dag_node_id: 'atlas:rank:topk',
    stage: 'topk_selection',
    logical_lane: 'rank_topk',
    algorithm_class: 'exact_reference',
    algorithm: 'cpu_exact_stable_topk',
    geometry: 'tile_4x6_linear_head',
    metric: 'linear_head_score',
    compute_backend: 'cpu_oracle',
    compilation_mode: 'none',
    transport: 'local',
    serialization: 'json',
    source_snapshot_revision: execution.candidateSnapshotRevision,
    representation_revision: execution.representationRevision,
    graph_snapshot_revision: execution.graphRevision,
    relationship_snapshot_revision: null,
    input_checksum: topKInputChecksumV1(execution),
    output_checksum: execution.outputDigest,
    manifest_checksum: topKManifestChecksumV1(execution),
    manifest: { execution, timing },
  };
}

export type PersistTopKResultV1 =
  | { status: 'INSERTED'; executionId: string }
  | { status: 'IDEMPOTENT'; executionId: string };

const INSERT_SQL = `INSERT INTO atlas_algorithm_execution_receipts (
  execution_id, workflow_id, action_id, dag_node_id, stage, logical_lane, algorithm_class, algorithm, geometry, metric,
  compute_backend, compilation_mode, transport, serialization, source_snapshot_revision, representation_revision,
  graph_snapshot_revision, relationship_snapshot_revision, input_checksum, output_checksum, manifest_checksum, manifest)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
 ON CONFLICT (execution_id) DO NOTHING RETURNING execution_id`;

/** Shared insert for every writer of `atlas_algorithm_execution_receipts` (one table, one statement, no per-lane copy). */
export const ALGORITHM_RECEIPT_INSERT_SQL = INSERT_SQL;

export function topKReceiptInsertV1(row: AlgorithmExecutionReceiptRowV1): { text: string; values: unknown[] } {
  return {
    text: INSERT_SQL,
    values: [
      row.execution_id, row.workflow_id, row.action_id, row.dag_node_id, row.stage, row.logical_lane, row.algorithm_class,
      row.algorithm, row.geometry, row.metric, row.compute_backend, row.compilation_mode, row.transport, row.serialization,
      row.source_snapshot_revision, row.representation_revision, row.graph_snapshot_revision, row.relationship_snapshot_revision,
      row.input_checksum, row.output_checksum, row.manifest_checksum, JSON.stringify(row.manifest),
    ],
  };
}

/**
 * Idempotent by execution id. A second insert of identical content (same manifest checksum) is a no-op;
 * the same id with different content is rejected, never overwritten. The row is re-validated first so a
 * hand-edited row cannot reach the table.
 */
export async function persistTopKExecutionReceiptV1(client: SqlClientV1, row: AlgorithmExecutionReceiptRowV1): Promise<PersistTopKResultV1> {
  const execution = TopKExecutionSchema.parse(row.manifest.execution);
  if (row.execution_id !== execution.executionId) throw new Error('EXECUTION_RECEIPT_ID_MISMATCH');
  if (row.manifest_checksum !== topKManifestChecksumV1(execution)) throw new Error('EXECUTION_RECEIPT_MANIFEST_CHECKSUM_MISMATCH');
  if (row.input_checksum !== topKInputChecksumV1(execution)) throw new Error('EXECUTION_RECEIPT_INPUT_CHECKSUM_MISMATCH');
  if (row.output_checksum !== execution.outputDigest) throw new Error('EXECUTION_RECEIPT_OUTPUT_CHECKSUM_MISMATCH');
  if (row.compute_backend !== 'cpu_oracle') throw new Error('EXECUTION_RECEIPT_BACKEND_NOT_CPU_ORACLE');

  const insert = topKReceiptInsertV1(row);
  const inserted = await client.query(insert.text, insert.values);
  if (inserted.rows.length === 1) return { status: 'INSERTED', executionId: row.execution_id };

  const existing = await client.query('SELECT manifest_checksum FROM atlas_algorithm_execution_receipts WHERE execution_id = $1', [row.execution_id]);
  const stored = existing.rows[0]?.manifest_checksum;
  if (stored === row.manifest_checksum) return { status: 'IDEMPOTENT', executionId: row.execution_id };
  throw new Error(`EXECUTION_RECEIPT_CONFLICT:${row.execution_id}`);
}

export interface TopKVerificationCheckV1 { name: string; ok: boolean; detail?: string }
export interface TopKVerificationV1 {
  schema: 'atlas.topk.verification.v1';
  verifierId: typeof TOPK_VERIFIER_ID;
  executionId: string;
  status: 'VERIFIED_PASS' | 'VERIFIED_FAIL';
  checks: TopKVerificationCheckV1[];
  /** A verdict is a separate artifact; it never edits the execution receipt. */
  canonicalAuthority: false;
}

/**
 * Independent verification: recompute checksums from the stored manifest, then REPLAY the whole CPU path
 * (sealed map -> columnar gather -> tile -> existing features/ GEMM -> exact Top-K) and compare. The execution's
 * own `status: PASS` is never trusted.
 */
export function verifyTopKExecutionReceiptV1(params: {
  row: AlgorithmExecutionReceiptRowV1;
  ordinalMap: CandidateOrdinalMapV1;
  columnar: CandidateFeatureColumnarV1;
  head: z.input<typeof candidateFeatureHeadV1Schema>;
  options: ValidateRankInputOptions;
  producerRevision: string;
  queryDigest: string;
}): TopKVerificationV1 {
  const checks: TopKVerificationCheckV1[] = [];
  const push = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, ...(detail ? { detail } : {}) }); return ok; };
  const finish = (executionId: string): TopKVerificationV1 => ({
    schema: 'atlas.topk.verification.v1',
    verifierId: TOPK_VERIFIER_ID,
    executionId,
    status: checks.every((check) => check.ok) ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    checks,
    canonicalAuthority: false,
  });
  const { row } = params;

  const parsed = TopKExecutionSchema.safeParse(row.manifest?.execution);
  push('manifest_schema', parsed.success, parsed.success ? undefined : parsed.error.issues[0]?.message);
  if (!parsed.success) return finish(row.execution_id);
  const execution = parsed.data;

  push('execution_id_matches_row', row.execution_id === execution.executionId);
  const { executionId: _id, ...body } = execution;
  push('execution_id_recomputed', executionIdentity(body) === execution.executionId);
  push('manifest_checksum_recomputed', row.manifest_checksum === topKManifestChecksumV1(execution));
  push('input_checksum_recomputed', row.input_checksum === topKInputChecksumV1(execution));
  push('output_checksum_matches_manifest', row.output_checksum === execution.outputDigest);
  push('backend_is_cpu', row.compute_backend === 'cpu_oracle' && execution.backend === 'cpu' && execution.gpuExecuted === false);
  push('row_revisions_match_manifest',
    row.source_snapshot_revision === execution.candidateSnapshotRevision
    && row.representation_revision === execution.representationRevision
    && row.graph_snapshot_revision === execution.graphRevision);

  let replayOk = false;
  try {
    const map = candidateOrdinalMapV1Schema.parse(params.ordinalMap);
    assertCandidateOrdinalMapIntegrityV1(map);
    push('sealed_map_checksum_current', map.ordinalMapChecksum === execution.ordinalMapDigest);
    push('sealed_map_snapshot_current', map.candidateSnapshotRevision === execution.candidateSnapshotRevision && map.workspaceRevision === execution.workspaceRevision);
    push('columnar_checksum_current', params.columnar.columnarChecksum === execution.columnarChecksum);

    const input = buildAtlasRankInputV1({
      queryDigest: params.queryDigest,
      graphRevision: execution.graphRevision,
      ordinalMap: map,
      columnar: params.columnar,
      candidateOrdinals: execution.candidateOrdinals,
      taxonomyRevision: execution.taxonomyRevision,
      featureSchemaRevision: execution.featureSchemaRevision,
      evidenceRevision: execution.evidenceRevision,
    });
    const scored = scoreAtlasRankInputWithFeaturesGemm({
      input, options: params.options, columnar: params.columnar, head: params.head, producerRevision: params.producerRevision, topK: execution.k,
    });
    const canonicalIds = deriveCanonicalIds(map, scored.candidateOrdinals);
    const selected = runCpuExactTopK({ candidateOrdinals: scored.candidateOrdinals, canonicalIds, scores: scored.scores, k: execution.k });
    const digests = executionDigests({ ordinals: scored.candidateOrdinals, canonicalIds, ordinalMapChecksum: map.ordinalMapChecksum, scores: scored.scores, selected });
    push('replay_tile_digest', scored.tileDigest === execution.tileDigest);
    push('replay_candidate_set_digest', digests.candidateSetDigest === execution.candidateSetDigest);
    push('replay_score_vector_digest', digests.scoreVectorDigest === execution.scoreVectorDigest);
    push('replay_selected_equal', canonicalSha256V1(selected) === canonicalSha256V1(execution.selected));
    push('replay_output_digest', digests.outputDigest === execution.outputDigest);
    replayOk = true;
  } catch (error) {
    push('replay_completed', false, error instanceof Error ? error.message : String(error));
  }
  if (replayOk) push('replay_completed', true);
  return finish(execution.executionId);
}
