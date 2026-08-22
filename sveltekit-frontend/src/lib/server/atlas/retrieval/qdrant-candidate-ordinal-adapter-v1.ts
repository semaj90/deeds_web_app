import { createHash } from 'node:crypto';
import { z } from 'zod';

import { candidateOrdinalMapV1Schema } from '../features/canonical-candidate-v1.js';
import type { QdrantSemanticScoreReceiptV1 } from './qdrant-semantic-scorer.js';
import {
  normalizeDenseExecutorHitsToCandidateOrdinals,
  type DenseSearchHitV1,
  type DenseSearchNormalizationReceiptV1,
} from './dense-executor-candidate-ordinal-v1.js';

export const FANOUT_ADMISSION_PROOF_STATUS = 'FANOUT_ADMISSION_READONLY_PROVEN' as const;

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const qdrantCandidateOrdinalAdapterReceiptV1Schema = z.object({
  schema: z.literal('atlas.qdrant-candidate-ordinal-adapter-receipt.v1'),
  admissionProofStatus: z.literal(FANOUT_ADMISSION_PROOF_STATUS),
  sourceReceiptSchema: z.literal('atlas.qdrant-semantic-score-receipt.v2'),
  sourceRepresentationId: id,
  sourceRepresentationRevision: id,
  candidateSnapshotRevision: id,
  ordinalMapChecksum: checksum,
  inputScoreCount: z.number().int().nonnegative(),
  normalizedHitCount: z.number().int().nonnegative(),
  rejectedHitCount: z.number().int().nonnegative(),
  qdrantPointIdsEscapedAboveBoundary: z.literal(false),
  vectorsEscapedAboveBoundary: z.literal(false),
  qdrantPayloadClaimedAsRevisionAuthority: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: id,
  receiptChecksum: checksum,
}).strict();

export type QdrantCandidateOrdinalAdapterReceiptV1 = z.infer<
  typeof qdrantCandidateOrdinalAdapterReceiptV1Schema
>;

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

/**
 * Qdrant adapter for FANOUT-01A.
 *
 * The caller must supply an already-proven read-only FANOUT admission token and
 * the exact frozen CandidateOrdinalMapV1 produced by that admitted candidate
 * world. This adapter does not inspect or authorize revision lineage itself.
 * Qdrant payload revisions remain projection evidence only.
 *
 * The input receipt may contain vectors and Qdrant point IDs because those are
 * useful below the executor boundary (for example cuVS exact reranking). They
 * are deliberately discarded here; only CandidateOrdinal + score + rank may
 * escape upward.
 */
export function adaptQdrantSemanticScoresToCandidateOrdinals(input: {
  admissionProofStatus: typeof FANOUT_ADMISSION_PROOF_STATUS;
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  qdrantReceipt: QdrantSemanticScoreReceiptV1;
  producerRevision: string;
}): {
  hits: DenseSearchHitV1[];
  normalizationReceipt: DenseSearchNormalizationReceiptV1;
  adapterReceipt: QdrantCandidateOrdinalAdapterReceiptV1;
} {
  if (input.admissionProofStatus !== FANOUT_ADMISSION_PROOF_STATUS) {
    throw new Error('FANOUT_ADMISSION_PROOF_REQUIRED');
  }

  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const qdrantReceipt = input.qdrantReceipt;

  if (qdrantReceipt.schema !== 'atlas.qdrant-semantic-score-receipt.v2') {
    throw new Error('QDRANT_SCORE_RECEIPT_SCHEMA_REJECTED');
  }
  if (qdrantReceipt.returnedPacketKeys !== qdrantReceipt.scores.length) {
    throw new Error('QDRANT_SCORE_RECEIPT_COUNT_MISMATCH');
  }

  const normalized = normalizeDenseExecutorHitsToCandidateOrdinals({
    ordinalMap,
    producerRevision: input.producerRevision,
    hits: qdrantReceipt.scores.map((score, index) => ({
      executor: 'QDRANT' as const,
      score: score.score,
      rank: index + 1,
      packetKey: score.packetKey,
      symbolVersionId: score.symbolVersionId,
      treeNodeId: score.treeNodeId,
      qdrantPointId: score.pointId,
    })),
  });

  const payload = {
    schema: 'atlas.qdrant-candidate-ordinal-adapter-receipt.v1' as const,
    admissionProofStatus: FANOUT_ADMISSION_PROOF_STATUS,
    sourceReceiptSchema: qdrantReceipt.schema,
    sourceRepresentationId: qdrantReceipt.representationId,
    sourceRepresentationRevision: qdrantReceipt.representationRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    inputScoreCount: qdrantReceipt.scores.length,
    normalizedHitCount: normalized.hits.length,
    rejectedHitCount: normalized.receipt.rejectedHitCount,
    qdrantPointIdsEscapedAboveBoundary: false as const,
    vectorsEscapedAboveBoundary: false as const,
    qdrantPayloadClaimedAsRevisionAuthority: false as const,
    canonicalWritesAttempted: false as const,
    producerRevision: input.producerRevision,
  };

  return {
    hits: normalized.hits,
    normalizationReceipt: normalized.receipt,
    adapterReceipt: qdrantCandidateOrdinalAdapterReceiptV1Schema.parse({
      ...payload,
      receiptChecksum: digest(payload),
    }),
  };
}
