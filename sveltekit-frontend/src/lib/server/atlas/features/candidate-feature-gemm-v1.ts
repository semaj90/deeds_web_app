import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  CANDIDATE_SCALAR_FEATURES,
  candidateFeatureColumnarV1Schema,
} from './candidate-feature-columnar-v1.js';

export const CANDIDATE_FEATURE_GEMM_SCHEMA = 'atlas.candidate-feature-gemm-reference.v1' as const;
export const CANDIDATE_FEATURE_GEMM_PRODUCER = 'parent-atlas.cpu-gemm-reference.v1' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);

export const candidateFeatureHeadV1Schema = z.object({
  headId: z.string().min(1),
  featureRevision: revision,
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  headCount: z.number().int().positive(),
  weights: z.array(z.array(z.number().finite())),
  bias: z.array(z.number().finite()),
}).strict().superRefine((value, ctx) => {
  if (value.weights.length !== value.headCount || value.bias.length !== value.headCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['headCount'], message: 'GEMM_HEAD_COUNT_MISMATCH' });
  }
  if (value.weights.some((row) => row.length !== value.featureCount)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weights'], message: 'GEMM_FEATURE_COUNT_MISMATCH' });
  }
});
export type CandidateFeatureHeadV1 = z.infer<typeof candidateFeatureHeadV1Schema>;

export const candidateFeatureGemmReceiptV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GEMM_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  featureSnapshotChecksum: checksum,
  workspaceRevision: revision,
  featureRevision: revision,
  headId: z.string().min(1),
  candidateOrdinals: z.array(z.number().int().nonnegative()),
  scores: z.array(z.array(z.number().finite())),
  scoreChecksum: checksum,
  inputChecksum: checksum,
  producer: z.literal(CANDIDATE_FEATURE_GEMM_PRODUCER),
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: revision,
}).strict();
export type CandidateFeatureGemmReceiptV1 = z.infer<typeof candidateFeatureGemmReceiptV1Schema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`;
}

function f32(value: number): number {
  return new Float32Array([value])[0] ?? value;
}

/**
 * Deterministic CPU oracle for X[N,F] x W[H,F] + bias.
 *
 * It consumes the already materialized columnar feature fabric. Missing values
 * remain zero in the numeric plane; presence bits are carried by the source
 * checksum and are not silently converted into learned values. This is a
 * reference computation only: it does not rank canonical truth or mutate any
 * store, and its receipt cannot authorize GPU promotion.
 */
export function scoreCandidateFeatureHeadsCpu(input: {
  columnar: z.input<typeof candidateFeatureColumnarV1Schema>;
  head: z.input<typeof candidateFeatureHeadV1Schema>;
  producerRevision: string;
}): CandidateFeatureGemmReceiptV1 {
  const columnar = candidateFeatureColumnarV1Schema.parse(input.columnar);
  const head = candidateFeatureHeadV1Schema.parse(input.head);
  if (head.featureRevision !== columnar.featureRevision) throw new Error('GEMM_FEATURE_REVISION_MISMATCH');

  const inputPayload = {
    columnarChecksum: columnar.columnarChecksum,
    featureNames: CANDIDATE_SCALAR_FEATURES,
    featureValues: columnar.featureValues,
    featurePresence: columnar.featurePresence,
    headId: head.headId,
    weights: head.weights,
    bias: head.bias,
  };
  const inputChecksum = sha256(stableJson(inputPayload));
  const scores = Array.from({ length: columnar.rowCount }, (_, row) => {
    const base = row * columnar.featureCount;
    return head.weights.map((weights, headIndex) => {
      let value = head.bias[headIndex] ?? 0;
      for (let feature = 0; feature < columnar.featureCount; feature += 1) {
        value += (columnar.featureValues[base + feature] ?? 0) * (weights[feature] ?? 0);
      }
      return f32(value);
    });
  });
  const scoreChecksum = sha256(stableJson(scores));
  const payload = {
    schema: CANDIDATE_FEATURE_GEMM_SCHEMA,
    candidateSnapshotRevision: columnar.candidateSnapshotRevision,
    ordinalMapChecksum: columnar.ordinalMapChecksum,
    featureSnapshotChecksum: columnar.featureSnapshotChecksum,
    workspaceRevision: columnar.workspaceRevision,
    featureRevision: columnar.featureRevision,
    headId: head.headId,
    candidateOrdinals: columnar.candidateOrdinals,
    scores,
    scoreChecksum,
    inputChecksum,
    producer: CANDIDATE_FEATURE_GEMM_PRODUCER,
    identityAuthority: false as const,
    canonicalOwnerChanged: false as const,
    canonicalWritesAttempted: false as const,
    producerRevision: input.producerRevision,
  };
  return candidateFeatureGemmReceiptV1Schema.parse(payload);
}

export function assertCandidateFeatureGemmParity(input: {
  expected: CandidateFeatureGemmReceiptV1;
  actualScores: readonly (readonly number[])[];
  tolerance?: number;
}): void {
  const expected = candidateFeatureGemmReceiptV1Schema.parse(input.expected);
  const tolerance = input.tolerance ?? 1e-5;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('GEMM_PARITY_TOLERANCE_INVALID');
  if (input.actualScores.length !== expected.scores.length) throw new Error('GEMM_PARITY_ROW_COUNT_MISMATCH');
  for (let row = 0; row < expected.scores.length; row += 1) {
    const expectedRow = expected.scores[row] ?? [];
    const actualRow = input.actualScores[row] ?? [];
    if (actualRow.length !== expectedRow.length) throw new Error(`GEMM_PARITY_HEAD_COUNT_MISMATCH:${row}`);
    for (let head = 0; head < expectedRow.length; head += 1) {
      const actual = actualRow[head];
      const wanted = expectedRow[head];
      if (!Number.isFinite(actual) || Math.abs(actual - wanted) > tolerance) {
        throw new Error(`GEMM_PARITY_MISMATCH:${row}:${head}`);
      }
    }
  }
}
