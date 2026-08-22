import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';

export const DENSE_EXECUTOR_KINDS = ['QDRANT', 'CUVS_EXACT', 'CAGRA', 'TURBOVEC'] as const;
export const denseExecutorKindSchema = z.enum(DENSE_EXECUTOR_KINDS);

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const denseExecutorRawHitV1Schema = z.object({
  executor: denseExecutorKindSchema,
  score: z.number().finite(),
  rank: z.number().int().positive(),
  candidateOrdinal: z.number().int().nonnegative().nullable().default(null),
  canonicalId: id.nullable().default(null),
  packetKey: id.nullable().default(null),
  symbolVersionId: id.nullable().default(null),
  treeNodeId: id.nullable().default(null),
  qdrantPointId: z.union([z.string(), z.number()]).nullable().default(null),
  executorLocalId: z.union([z.string(), z.number()]).nullable().default(null),
}).strict();
export type DenseExecutorRawHitV1 = z.infer<typeof denseExecutorRawHitV1Schema>;

export const denseSearchHitV1Schema = z.object({
  schema: z.literal('atlas.dense-search-hit.v1'),
  candidateOrdinal: z.number().int().nonnegative(),
  score: z.number().finite(),
  rank: z.number().int().positive(),
  executor: denseExecutorKindSchema,
  candidateSnapshotRevision: id,
  ordinalMapChecksum: checksum,
  identityAuthority: z.literal(false),
  executorIdentityEscaped: z.literal(false),
}).strict();
export type DenseSearchHitV1 = z.infer<typeof denseSearchHitV1Schema>;

export const denseSearchNormalizationReceiptV1Schema = z.object({
  schema: z.literal('atlas.dense-search-normalization-receipt.v1'),
  candidateSnapshotRevision: id,
  ordinalMapChecksum: checksum,
  inputHitCount: z.number().int().nonnegative(),
  outputHitCount: z.number().int().nonnegative(),
  rejectedHitCount: z.number().int().nonnegative(),
  executorIdsEscapedAboveBoundary: z.literal(false),
  ordinalRemappingPerformed: z.literal(false),
  rankingMutationPerformed: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: id,
  receiptChecksum: checksum,
}).strict();
export type DenseSearchNormalizationReceiptV1 = z.infer<typeof denseSearchNormalizationReceiptV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function candidateMatchesRawHit(
  map: CandidateOrdinalMapV1,
  ordinal: number,
  hit: DenseExecutorRawHitV1,
): boolean {
  const candidate = map.candidates[ordinal];
  if (!candidate || candidate.candidateOrdinal !== ordinal) return false;

  if (hit.canonicalId !== null && hit.canonicalId !== candidate.canonicalId) return false;
  if (hit.packetKey !== null && hit.packetKey !== candidate.packetKey) return false;
  if (hit.symbolVersionId !== null && hit.symbolVersionId !== candidate.symbolVersionId) return false;
  if (hit.treeNodeId !== null && hit.treeNodeId !== candidate.treeNodeId) return false;
  return true;
}

function resolveOrdinal(map: CandidateOrdinalMapV1, hit: DenseExecutorRawHitV1): number | null {
  if (hit.candidateOrdinal !== null) {
    return candidateMatchesRawHit(map, hit.candidateOrdinal, hit) ? hit.candidateOrdinal : null;
  }

  const matches = map.candidates.filter((candidate) => {
    if (hit.canonicalId !== null && hit.canonicalId !== candidate.canonicalId) return false;
    if (hit.packetKey !== null && hit.packetKey !== candidate.packetKey) return false;
    if (hit.symbolVersionId !== null && hit.symbolVersionId !== candidate.symbolVersionId) return false;
    if (hit.treeNodeId !== null && hit.treeNodeId !== candidate.treeNodeId) return false;
    return hit.canonicalId !== null || hit.packetKey !== null || hit.symbolVersionId !== null || hit.treeNodeId !== null;
  });

  return matches.length === 1 ? matches[0]!.candidateOrdinal : null;
}

/**
 * Pure FANOUT executor boundary. It never allocates or compacts ordinals and it
 * never treats an executor-local ID as canonical identity. Raw Qdrant/cuVS/
 * CAGRA/TurboVec IDs terminate here; only an ordinal already present in the
 * frozen CandidateOrdinalMapV1 may leave this function.
 */
export function normalizeDenseExecutorHitsToCandidateOrdinals(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  hits: readonly z.input<typeof denseExecutorRawHitV1Schema>[];
  producerRevision: string;
}): {
  hits: DenseSearchHitV1[];
  receipt: DenseSearchNormalizationReceiptV1;
} {
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const rawHits = input.hits.map((hit) => denseExecutorRawHitV1Schema.parse(hit));
  const seenOrdinals = new Set<number>();
  const normalized: DenseSearchHitV1[] = [];
  let rejectedHitCount = 0;

  for (const hit of rawHits) {
    const ordinal = resolveOrdinal(map, hit);
    if (ordinal === null || seenOrdinals.has(ordinal)) {
      rejectedHitCount += 1;
      continue;
    }
    seenOrdinals.add(ordinal);
    normalized.push(denseSearchHitV1Schema.parse({
      schema: 'atlas.dense-search-hit.v1',
      candidateOrdinal: ordinal,
      score: hit.score,
      rank: hit.rank,
      executor: hit.executor,
      candidateSnapshotRevision: map.candidateSnapshotRevision,
      ordinalMapChecksum: map.ordinalMapChecksum,
      identityAuthority: false,
      executorIdentityEscaped: false,
    }));
  }

  // Preserve executor order/ranking exactly. This boundary is identity
  // normalization only; ranking/fusion happens later.
  const payload = {
    schema: 'atlas.dense-search-normalization-receipt.v1' as const,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    inputHitCount: rawHits.length,
    outputHitCount: normalized.length,
    rejectedHitCount,
    executorIdsEscapedAboveBoundary: false as const,
    ordinalRemappingPerformed: false as const,
    rankingMutationPerformed: false as const,
    canonicalWritesAttempted: false as const,
    producerRevision: input.producerRevision,
  };

  return {
    hits: normalized,
    receipt: denseSearchNormalizationReceiptV1Schema.parse({
      ...payload,
      receiptChecksum: digest(payload),
    }),
  };
}
