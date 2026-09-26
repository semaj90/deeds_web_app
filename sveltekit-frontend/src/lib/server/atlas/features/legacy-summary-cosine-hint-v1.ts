import { createHash } from 'node:crypto';
import { z } from 'zod';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const LEGACY_SUMMARY_COSINE_HINT_SCHEMA = 'atlas.legacy-summary-cosine-hint.v1' as const;

export const legacySummaryCosineHintRowV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  summaryDigest: checksum,
  trustTier: z.enum(['LEGACY_HINT_LINEAGE_BOUND', 'LEGACY_HINT_UNQUALIFIED']),
  rawCosine: z.number().finite().min(-1).max(1),
  score01: z.number().finite().min(0).max(1),
  queryRank: z.number().int().positive(),
  evidenceRef: z.string().min(1),
}).strict().superRefine((row, ctx) => {
  if (Math.abs(row.score01 - (row.rawCosine + 1) / 2) > 1e-12) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['score01'], message: 'LEGACY_HINT_SCORE_NORMALIZATION_MISMATCH' });
  }
});

const legacySummaryCosineHintArtifactShapeV1 = z.object({
  schema: z.literal(LEGACY_SUMMARY_COSINE_HINT_SCHEMA),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: checksum,
  queryDigest: checksum,
  featureRevision: z.string().min(1),
  rows: z.array(legacySummaryCosineHintRowV1Schema),
  canonicalAuthority: z.literal(false),
  retrievalVote: z.literal(false),
  rankingPromotion: z.literal(false),
}).strict();

function validateArtifactRows(artifact: z.infer<typeof legacySummaryCosineHintArtifactShapeV1>, ctx: z.RefinementCtx): void {
  const ordinals = new Set<number>();
  const ranks = new Set<number>();
  for (const [index, row] of artifact.rows.entries()) {
    const previous = artifact.rows[index - 1];
    if (row.queryRank !== index + 1 || (previous && (
      row.rawCosine > previous.rawCosine ||
      (row.rawCosine === previous.rawCosine && row.candidateOrdinal < previous.candidateOrdinal)
    ))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index], message: 'LEGACY_HINT_RANK_ORDER_INVALID' });
    }
    if (ordinals.has(row.candidateOrdinal)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'candidateOrdinal'], message: 'LEGACY_HINT_DUPLICATE_CANDIDATE_ORDINAL' });
    }
    if (ranks.has(row.queryRank)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'queryRank'], message: 'LEGACY_HINT_DUPLICATE_QUERY_RANK' });
    }
    ordinals.add(row.candidateOrdinal);
    ranks.add(row.queryRank);
  }
  for (let rank = 1; rank <= artifact.rows.length; rank += 1) {
    if (!ranks.has(rank)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'LEGACY_HINT_RANKS_NOT_CONTIGUOUS' });
      break;
    }
  }
}

const legacySummaryCosineHintArtifactPayloadV1Schema = legacySummaryCosineHintArtifactShapeV1
  .superRefine(validateArtifactRows);

export const legacySummaryCosineHintArtifactV1Schema = legacySummaryCosineHintArtifactShapeV1
  .extend({ artifactChecksum: checksum })
  .superRefine(validateArtifactRows);

export type LegacySummaryCosineHintRowV1 = z.infer<typeof legacySummaryCosineHintRowV1Schema>;
export type LegacySummaryCosineHintArtifactV1 = z.infer<typeof legacySummaryCosineHintArtifactV1Schema>;

function payloadChecksum(payload: Omit<LegacySummaryCosineHintArtifactV1, 'artifactChecksum'>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function sealLegacySummaryCosineHintArtifactV1(
  input: Omit<LegacySummaryCosineHintArtifactV1, 'artifactChecksum'>,
): LegacySummaryCosineHintArtifactV1 {
  const parsed = legacySummaryCosineHintArtifactPayloadV1Schema.parse(input);
  return legacySummaryCosineHintArtifactV1Schema.parse({ ...parsed, artifactChecksum: payloadChecksum(parsed) });
}

export function verifyLegacySummaryCosineHintArtifactV1(
  input: unknown,
): LegacySummaryCosineHintArtifactV1 {
  const artifact = legacySummaryCosineHintArtifactV1Schema.parse(input);
  const { artifactChecksum, ...payload } = artifact;
  if (payloadChecksum(payload) !== artifactChecksum) throw new Error('LEGACY_HINT_ARTIFACT_CHECKSUM_MISMATCH');
  return artifact;
}
