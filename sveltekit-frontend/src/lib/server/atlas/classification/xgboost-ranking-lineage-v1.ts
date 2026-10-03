import { createHash } from 'node:crypto';
import { z } from 'zod';
import { candidateFeatureSnapshotV1Schema } from '../features/candidate-feature-snapshot-v1.js';
import { CANDIDATE_SCALAR_FEATURES } from '../features/candidate-feature-columnar-v1.js';

export const XGBOOST_RANKING_LINEAGE_REVISION_V1 = 'atlas.xgboost-ranking-lineage.v1' as const;

export const XgboostRankingCandidateV1Schema = z.object({
  queryId: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  providerRevision: z.string().min(1),
  modelRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  labelRevision: z.string().min(1),
  labelSource: z.enum(['human_judgment', 'admitted_evaluation_receipt', 'held_out_manifest']),
  labelEvidenceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  label: z.number().finite().int().min(0),
  features: z.array(z.number().finite()).min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type XgboostRankingCandidateV1 = z.infer<typeof XgboostRankingCandidateV1Schema>;

export const XgboostLabelEvidenceV1Schema = z.object({
  label: z.number().finite().int().min(0),
  labelRevision: z.string().min(1),
  labelSource: z.enum(['human_judgment', 'admitted_evaluation_receipt', 'held_out_manifest']),
  labelEvidenceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

export type XgboostLabelEvidenceV1 = z.infer<typeof XgboostLabelEvidenceV1Schema>;

export const rerankerEvaluationAdmissionV1Schema = z.object({
  schema: z.literal('atlas.reranker-evaluation-admission.v1'),
  status: z.enum(['EVALUATION_READY', 'BLOCKED_CORPUS', 'BLOCKED_EVALUATION']),
  corpusChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  modelArtifactChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  heldOutReceiptChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  trainingAuthorized: z.literal(false),
  promotionAuthorized: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  reason: z.string().min(1).nullable(),
}).strict().superRefine((admission, ctx) => {
  if (admission.status === 'EVALUATION_READY') {
    if (admission.corpusChecksum === null || admission.modelArtifactChecksum === null || admission.heldOutReceiptChecksum === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'EVALUATION_READY_CHECKSUMS_REQUIRED' });
    }
    if (admission.reason !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'EVALUATION_READY_REASON_FORBIDDEN' });
    }
  } else if (admission.reason === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'BLOCKED_EVALUATION_REASON_REQUIRED' });
  }
});
export type RerankerEvaluationAdmissionV1 = z.infer<typeof rerankerEvaluationAdmissionV1Schema>;

/** Read-only Stage 12 boundary; model ranking never authorizes promotion. */
export function admitRerankerEvaluationV1(input: {
  corpusStatus: 'ADMITTED' | 'BLOCKED' | 'UNAVAILABLE';
  evaluationStatus: 'HELD_OUT_PROVEN' | 'MISSING' | 'INVALID';
  corpusChecksum?: string | null;
  modelArtifactChecksum?: string | null;
  heldOutReceiptChecksum?: string | null;
}): RerankerEvaluationAdmissionV1 {
  const status = input.corpusStatus !== 'ADMITTED'
    ? 'BLOCKED_CORPUS' as const
    : input.evaluationStatus !== 'HELD_OUT_PROVEN'
      ? 'BLOCKED_EVALUATION' as const
      : 'EVALUATION_READY' as const;
  const reason = status === 'BLOCKED_CORPUS'
    ? `CORPUS_${input.corpusStatus}`
    : status === 'BLOCKED_EVALUATION'
      ? `EVALUATION_${input.evaluationStatus}`
      : null;
  return rerankerEvaluationAdmissionV1Schema.parse({
    schema: 'atlas.reranker-evaluation-admission.v1',
    status,
    corpusChecksum: input.corpusChecksum ?? null,
    modelArtifactChecksum: input.modelArtifactChecksum ?? null,
    heldOutReceiptChecksum: input.heldOutReceiptChecksum ?? null,
    trainingAuthorized: false,
    promotionAuthorized: false,
    canonicalAuthority: false,
    writesPerformed: false,
    reason,
  });
}

export const XgboostHeldOutEvaluationReceiptV1Schema = z.object({
  schema: z.literal('atlas.xgboost-held-out-evaluation-receipt.v1'),
  modelRevision: z.string().min(1),
  datasetRevision: z.string().min(1),
  trainSourceRevisions: z.array(z.string().min(1)).min(1),
  heldOutSourceRevisions: z.array(z.string().min(1)).min(1),
  metrics: z.object({
    ndcgAt10: z.number().finite().min(0).max(1),
    evaluatedRows: z.number().int().positive(),
  }).strict(),
  sourceRevisionSplitDisjoint: z.literal(true),
  promotionAuthorized: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((receipt, ctx) => {
  const train = new Set(receipt.trainSourceRevisions);
  if (receipt.heldOutSourceRevisions.some((revision) => train.has(revision))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['heldOutSourceRevisions'],
      message: 'HELD_OUT_SOURCE_REVISION_OVERLAP',
    });
  }
});

export type XgboostHeldOutEvaluationReceiptV1 = z.infer<typeof XgboostHeldOutEvaluationReceiptV1Schema>;

export function buildXgboostHeldOutEvaluationReceiptV1(input: {
  modelRevision: string;
  datasetRevision: string;
  trainSourceRevisions: readonly string[];
  heldOutSourceRevisions: readonly string[];
  metrics: { ndcgAt10: number; evaluatedRows: number };
}): XgboostHeldOutEvaluationReceiptV1 {
  const body = {
    schema: 'atlas.xgboost-held-out-evaluation-receipt.v1' as const,
    modelRevision: input.modelRevision,
    datasetRevision: input.datasetRevision,
    trainSourceRevisions: [...new Set(input.trainSourceRevisions)].sort(),
    heldOutSourceRevisions: [...new Set(input.heldOutSourceRevisions)].sort(),
    metrics: input.metrics,
    sourceRevisionSplitDisjoint: true as const,
    promotionAuthorized: false as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return XgboostHeldOutEvaluationReceiptV1Schema.parse({ ...body, checksum: digest(JSON.stringify(body)) });
}

export interface XgboostRankingGroupV1 {
  queryId: string;
  candidates: XgboostRankingCandidateV1[];
  qid: number;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Convert one already-admitted feature snapshot into training rows. This is a
 * pure boundary: it does not search, assign ordinals, infer labels, or write
 * a corpus. Missing scalar features, graph lineage, or explicit label evidence
 * reject the conversion instead of becoming zero-valued training signals.
 */
export function buildXgboostRankingCandidatesFromFeatureSnapshotV1(input: {
  snapshot: unknown;
  queryId: string;
  representationRevision: string;
  modelRevision: string;
  labelsByCanonicalId: Readonly<Record<string, unknown>>;
}): XgboostRankingCandidateV1[] {
  const snapshot = candidateFeatureSnapshotV1Schema.parse(input.snapshot);
  if (!input.queryId.trim()) throw new Error('XGBOOST_RANKING_QUERY_ID_REQUIRED');
  if (!input.representationRevision.trim()) throw new Error('XGBOOST_RANKING_REPRESENTATION_REVISION_REQUIRED');
  if (!input.modelRevision.trim()) throw new Error('XGBOOST_RANKING_MODEL_REVISION_REQUIRED');

  return snapshot.rows.map((row) => {
    if (row.graphRevision === null) {
      throw new Error(`XGBOOST_RANKING_GRAPH_REVISION_REQUIRED:${row.candidateOrdinal}`);
    }
    const label = XgboostLabelEvidenceV1Schema.parse(input.labelsByCanonicalId[row.canonicalId]);
    if (row.sourceRef === null) {
      throw new Error(`XGBOOST_RANKING_SOURCE_REF_REQUIRED:${row.candidateOrdinal}`);
    }
    const features = CANDIDATE_SCALAR_FEATURES.map((name) => {
      const value = row[name];
      if (value === null || !Number.isFinite(value)) {
        throw new Error(`XGBOOST_RANKING_FEATURE_MISSING:${row.candidateOrdinal}:${name}`);
      }
      return value;
    });
    return XgboostRankingCandidateV1Schema.parse({
      queryId: input.queryId,
      candidateOrdinal: row.candidateOrdinal,
      canonicalId: row.canonicalId,
      sourceRef: row.sourceRef,
      sourceRevision: row.sourceRevision,
      workspaceRevision: snapshot.workspaceRevision,
      representationRevision: input.representationRevision,
      graphRevision: row.graphRevision,
      featureRevision: row.featureRevision,
      providerRevision: snapshot.producerRevision,
      modelRevision: input.modelRevision,
      candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
      ordinalMapChecksum: snapshot.ordinalMapChecksum,
      labelRevision: label.labelRevision,
      labelSource: label.labelSource,
      labelEvidenceChecksum: label.labelEvidenceChecksum,
      label: label.label,
      features,
      evidenceRefs: [...new Set([...row.evidenceRefs, ...label.evidenceRefs])],
    });
  });
}

/**
 * Validate and deterministically group LTR rows. qid is an ordinal assigned
 * after sorting query IDs; it is never inferred from a source filename or DB
 * row order. This is dataset preparation only, not a ranking authority.
 */
export function groupXgboostRankingCandidatesV1(input: readonly unknown[]): XgboostRankingGroupV1[] {
  const rows = input.map((row, index) => {
    try {
      return XgboostRankingCandidateV1Schema.parse(row);
    } catch (error) {
      throw new Error(`XGBOOST_RANKING_ROW_INVALID index=${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const widths = new Set(rows.map((row) => row.features.length));
  if (widths.size !== 1) throw new Error('XGBOOST_RANKING_FEATURE_WIDTH_MISMATCH');

  const byQuery = new Map<string, XgboostRankingCandidateV1[]>();
  for (const row of rows) {
    const group = byQuery.get(row.queryId) ?? [];
    group.push(row);
    byQuery.set(row.queryId, group);
  }

  return [...byQuery.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([queryId, candidates], qid) => {
      const ordered = [...candidates].sort((left, right) => left.candidateOrdinal - right.candidateOrdinal);
      const ordinals = ordered.map((row) => row.candidateOrdinal);
      if (new Set(ordinals).size !== ordinals.length) throw new Error(`XGBOOST_RANKING_DUPLICATE_ORDINAL query=${queryId}`);
      const lineage = new Set(ordered.map((row) => [
        row.sourceRevision,
        row.workspaceRevision,
        row.representationRevision,
        row.graphRevision,
        row.featureRevision,
        row.providerRevision,
        row.modelRevision,
        row.candidateSnapshotRevision,
        row.ordinalMapChecksum,
        row.labelRevision,
        row.labelSource,
        row.labelEvidenceChecksum,
      ].join('\u001f')));
      if (lineage.size !== 1) throw new Error(`XGBOOST_RANKING_LINEAGE_MISMATCH query=${queryId}`);
      return { queryId, candidates: ordered, qid };
    });
}

export function rankingLineageChecksumV1(groups: readonly XgboostRankingGroupV1[]): string {
  return digest(JSON.stringify(groups.map((group) => ({
    qid: group.qid,
    queryId: group.queryId,
    candidates: group.candidates.map((row) => ({
      candidateOrdinal: row.candidateOrdinal,
      canonicalId: row.canonicalId,
      sourceRef: row.sourceRef,
      sourceRevision: row.sourceRevision,
      workspaceRevision: row.workspaceRevision,
      representationRevision: row.representationRevision,
      graphRevision: row.graphRevision,
      featureRevision: row.featureRevision,
      providerRevision: row.providerRevision,
      modelRevision: row.modelRevision,
      candidateSnapshotRevision: row.candidateSnapshotRevision,
      ordinalMapChecksum: row.ordinalMapChecksum,
      labelRevision: row.labelRevision,
      labelSource: row.labelSource,
      labelEvidenceChecksum: row.labelEvidenceChecksum,
      label: row.label,
      features: row.features,
      evidenceRefs: [...row.evidenceRefs].sort(),
    })),
  }))));
}
