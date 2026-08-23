import { createHash } from 'node:crypto';
import { z } from 'zod';

export const XGBOOST_RANKING_LINEAGE_REVISION_V1 = 'atlas.xgboost-ranking-lineage.v1' as const;

export const XgboostRankingCandidateV1Schema = z.object({
  queryId: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  providerRevision: z.string().min(1),
  labelRevision: z.string().min(1),
  label: z.number().finite().int().min(0),
  features: z.array(z.number().finite()).min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type XgboostRankingCandidateV1 = z.infer<typeof XgboostRankingCandidateV1Schema>;

export interface XgboostRankingGroupV1 {
  queryId: string;
  candidates: XgboostRankingCandidateV1[];
  qid: number;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
      const lineage = new Set(ordered.map((row) => `${row.sourceRevision}\u001f${row.graphRevision}\u001f${row.featureRevision}\u001f${row.providerRevision}\u001f${row.labelRevision}`));
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
      sourceRef: row.sourceRef,
      sourceRevision: row.sourceRevision,
      graphRevision: row.graphRevision,
      featureRevision: row.featureRevision,
      providerRevision: row.providerRevision,
      labelRevision: row.labelRevision,
      label: row.label,
      features: row.features,
      evidenceRefs: [...row.evidenceRefs].sort(),
    })),
  }))));
}
