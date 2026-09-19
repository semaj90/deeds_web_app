import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

const revision = z.string().min(1);

export const VerifiedTrainingTupleEligibilityV1Schema = z.object({
  schema: z.literal('atlas.verified-training-tuple-eligibility.v1'),
  tupleId: z.string().min(1),
  queryChecksum: sha256HexSchema,
  labelChecksum: sha256HexSchema,
  labelKind: z.enum(['HUMAN_DECISION', 'VALIDATED_EXECUTION', 'STRUCTURED_ANNOTATION']),
  sourceRef: z.string().min(1),
  sourceRevision: revision,
  packetKey: z.string().min(1),
  workspaceRevision: revision,
  representationId: z.string().min(1),
  representationRevision: revision,
  modelRevision: revision,
  adapterRevision: revision.nullable(),
  executionReceiptChecksum: sha256HexSchema,
  validationReceiptChecksum: sha256HexSchema,
  executionStatus: z.literal('PROVEN'),
  validationStatus: z.literal('PROVEN'),
  datasetRevision: revision,
  split: z.enum(['TRAIN', 'HELD_OUT']),
  groundTruthVerified: z.literal(true),
  generatedTextOnly: z.literal(false),
  offlineOnly: z.literal(true),
  onlineWeightMutationAllowed: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  checksumSha256: sha256HexSchema,
}).strict();

export type VerifiedTrainingTupleEligibilityV1 = z.infer<typeof VerifiedTrainingTupleEligibilityV1Schema>;

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex');
}

export function buildVerifiedTrainingTupleEligibilityV1(
  input: Omit<VerifiedTrainingTupleEligibilityV1, 'schema' | 'checksumSha256'>,
): VerifiedTrainingTupleEligibilityV1 {
  if (!input.groundTruthVerified) throw new Error('TRAINING_GROUND_TRUTH_UNVERIFIED');
  if (input.generatedTextOnly) throw new Error('GENERATED_TEXT_CANNOT_BE_SOLE_GROUND_TRUTH');
  const payload = { schema: 'atlas.verified-training-tuple-eligibility.v1' as const, ...input };
  return VerifiedTrainingTupleEligibilityV1Schema.parse({ ...payload, checksumSha256: hashPayload(payload) });
}

export function assertDisjointTrainingSourceRevisionsV1(input: {
  trainSourceRevisions: readonly string[];
  heldOutSourceRevisions: readonly string[];
}): void {
  const heldOut = new Set(input.heldOutSourceRevisions);
  const overlap = input.trainSourceRevisions.filter((revisionValue) => heldOut.has(revisionValue));
  if (overlap.length > 0) throw new Error(`TRAIN_HELD_OUT_SOURCE_REVISION_OVERLAP:${overlap.join(',')}`);
}
