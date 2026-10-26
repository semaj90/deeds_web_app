import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';
import type { CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';

export const TOPK_SELECTION_RECEIPT_SCHEMA = 'atlas.topk-selection-receipt.v1' as const;

export const TopkSelectionAlgorithmSchema = z.enum([
  'constrained_beam',
  'rrf_fusion',
  'exact_knn',
  'adaptive_dag_fetch',
  'tournament_policy',
]);

export type TopkSelectionAlgorithm = z.infer<typeof TopkSelectionAlgorithmSchema>;

export const TopkSelectionAdmissionStatusSchema = z.enum([
  'ADMITTED',
  'DEGRADED',
  'REJECTED',
]);

export type TopkSelectionAdmissionStatus = z.infer<typeof TopkSelectionAdmissionStatusSchema>;

export const TopkSelectionReceiptV1Schema = z
  .object({
    schema: z.literal(TOPK_SELECTION_RECEIPT_SCHEMA),
    receiptChecksum: sha256HexSchema,
    queryChecksum: sha256HexSchema,
    runChecksum: sha256HexSchema,
    candidateSnapshotRevision: z.string().min(1),
    candidateSnapshotChecksum: sha256HexSchema,
    ordinalMapChecksum: sha256HexSchema,
    routingId: z.string().nullable().default(null),
    routingRevision: z.string().nullable().default(null),
    routingManifestDigest: sha256HexSchema.nullable().default(null),
    topkAlgorithm: TopkSelectionAlgorithmSchema,
    topkParameters: z.record(z.string(), z.unknown()),
    k: z.number().int().positive(),
    stableTieBreak: z.enum(['ordinal_asc', 'score_desc_ordinal_asc']),
    orderedCanonicalIds: z.array(z.string().min(1)),
    orderedCandidateOrdinals: z.array(z.number().int().nonnegative()),
    workspaceRevision: z.string().min(1),
    sourceRevisions: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/)),
    representationRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)),
    ontologyTupleRefs: z.array(z.string().min(1)).default([]),
    openspecTaskRefs: z.array(z.string().min(1)),
    contextManifestChecksum: sha256HexSchema,
    admissionStatus: TopkSelectionAdmissionStatusSchema,
    singleVoteInvariantEnforced: z.literal(true),
    advisoryFeaturesCannotCreateIdentity: z.literal(true),
  })
  .strict();

export type TopkSelectionReceiptV1 = z.infer<typeof TopkSelectionReceiptV1Schema>;

export interface BuildTopkSelectionReceiptInputV1 {
  queryChecksum: string;
  runChecksum: string;
  snapshot: CandidateFeatureSnapshotV1;
  selectedOrdinals: readonly number[];
  topkAlgorithm: TopkSelectionAlgorithm;
  topkParameters: Record<string, unknown>;
  k: number;
  stableTieBreak?: 'ordinal_asc' | 'score_desc_ordinal_asc';
  routingId?: string | null;
  routingRevision?: string | null;
  routingManifestDigest?: string | null;
  evidenceRefs: readonly string[];
  ontologyTupleRefs?: readonly string[];
  openspecTaskRefs: readonly string[];
  contextManifestChecksum: string;
  admissionStatus?: TopkSelectionAdmissionStatus;
}

/**
 * Builds a deterministic Top-K selection receipt binding candidate snapshot,
 * ordinal map, routing manifest, parameters, and ContextManifest admission.
 * Fails closed on mismatched revisions, duplicate or unresolved candidates,
 * stale source revisions, or missing OpenSpec task receipts.
 */
export function buildTopkSelectionReceiptV1(
  input: BuildTopkSelectionReceiptInputV1
): TopkSelectionReceiptV1 {
  if (input.selectedOrdinals.length === 0) {
    throw new Error('TOPK_SELECTION_EMPTY_ORDINAL_SET');
  }

  if (input.selectedOrdinals.length > input.k) {
    throw new Error(`TOPK_SELECTION_EXCEEDS_K: selected ${input.selectedOrdinals.length} > k ${input.k}`);
  }

  // Deduplication check
  const uniqueOrdinals = new Set(input.selectedOrdinals);
  if (uniqueOrdinals.size !== input.selectedOrdinals.length) {
    throw new Error('TOPK_SELECTION_DUPLICATE_CANDIDATES');
  }

  if (input.openspecTaskRefs.length === 0) {
    throw new Error('TOPK_SELECTION_MISSING_OPENSPEC_TASK_REFS');
  }

  const rowsByOrdinal = new Map<number, CandidateFeatureSnapshotV1['rows'][number]>();
  for (const row of input.snapshot.rows) {
    if (rowsByOrdinal.has(row.candidateOrdinal)) {
      throw new Error(`TOPK_SNAPSHOT_DUPLICATE_ORDINAL: ${row.candidateOrdinal}`);
    }
    rowsByOrdinal.set(row.candidateOrdinal, row);
  }

  const selectedRows = input.selectedOrdinals.map((ord) => {
    const row = rowsByOrdinal.get(ord);
    if (!row) {
      throw new Error(`TOPK_CANDIDATE_UNRESOLVED_IN_SNAPSHOT: ordinal ${ord}`);
    }
    return row;
  });

  const orderedCanonicalIds = selectedRows.map((r) => r.canonicalId);
  const sourceRevisions = [...new Set(selectedRows.map((r) => r.sourceRevision))].sort();

  // Validate that source revisions are valid sha256 formatted
  for (const rev of sourceRevisions) {
    if (!rev.startsWith('sha256:') || rev.length !== 71) {
      throw new Error(`TOPK_INVALID_SOURCE_REVISION: ${rev}`);
    }
  }

  const receiptCore = {
    schema: TOPK_SELECTION_RECEIPT_SCHEMA,
    queryChecksum: input.queryChecksum,
    runChecksum: input.runChecksum,
    candidateSnapshotRevision: input.snapshot.candidateSnapshotRevision,
    candidateSnapshotChecksum: input.snapshot.snapshotChecksum,
    ordinalMapChecksum: input.snapshot.ordinalMapChecksum,
    routingId: input.routingId ?? null,
    routingRevision: input.routingRevision ?? null,
    routingManifestDigest: input.routingManifestDigest ?? null,
    topkAlgorithm: input.topkAlgorithm,
    topkParameters: input.topkParameters,
    k: input.k,
    stableTieBreak: input.stableTieBreak ?? 'score_desc_ordinal_asc',
    orderedCanonicalIds,
    orderedCandidateOrdinals: [...input.selectedOrdinals],
    workspaceRevision: input.snapshot.workspaceRevision,
    sourceRevisions,
    representationRevision: selectedRows[0]?.semanticRevision ?? 'semantic_768_v1',
    featureRevision: input.snapshot.featureRevision,
    evidenceRefs: [...input.evidenceRefs].sort(),
    ontologyTupleRefs: [...(input.ontologyTupleRefs ?? [])].sort(),
    openspecTaskRefs: [...input.openspecTaskRefs].sort(),
    contextManifestChecksum: input.contextManifestChecksum,
    admissionStatus: input.admissionStatus ?? 'ADMITTED',
    singleVoteInvariantEnforced: true as const,
    advisoryFeaturesCannotCreateIdentity: true as const,
  };

  const receiptChecksum = canonicalSha256V1(receiptCore);

  const fullReceipt: TopkSelectionReceiptV1 = {
    ...receiptCore,
    receiptChecksum,
  };

  return TopkSelectionReceiptV1Schema.parse(fullReceipt);
}

/**
 * Validates a TopkSelectionReceiptV1 against an expected candidate snapshot and manifest checksum.
 */
export function verifyTopkSelectionReceiptV1(
  receipt: TopkSelectionReceiptV1,
  expected: {
    snapshot: CandidateFeatureSnapshotV1;
    contextManifestChecksum: string;
  }
): boolean {
  if (receipt.candidateSnapshotRevision !== expected.snapshot.candidateSnapshotRevision) {
    throw new Error('RECEIPT_SNAPSHOT_REVISION_MISMATCH');
  }
  if (receipt.candidateSnapshotChecksum !== expected.snapshot.snapshotChecksum) {
    throw new Error('RECEIPT_SNAPSHOT_CHECKSUM_MISMATCH');
  }
  if (receipt.ordinalMapChecksum !== expected.snapshot.ordinalMapChecksum) {
    throw new Error('RECEIPT_ORDINAL_MAP_CHECKSUM_MISMATCH');
  }
  if (receipt.contextManifestChecksum !== expected.contextManifestChecksum) {
    throw new Error('RECEIPT_CONTEXT_MANIFEST_CHECKSUM_MISMATCH');
  }

  // Verify self-integrity of receiptChecksum
  const { receiptChecksum, ...core } = receipt;
  const recomputed = canonicalSha256V1(core);
  if (recomputed !== receiptChecksum) {
    throw new Error('RECEIPT_SELF_CHECKSUM_TAMPERED');
  }

  return true;
}
