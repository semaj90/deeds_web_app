import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HMM_STATES, type HmmState } from './policy-types.js';
import { POLICY_ACTION_MASKS } from './policy-router.js';

export const POLICY_ACTION_MASK_REVISION = 'parent-atlas.policy-action-mask.v1' as const;

const ACTION_MASKS = Object.fromEntries(
  HMM_STATES.map((state) => [state, [...POLICY_ACTION_MASKS[state]]]),
) as Record<HmmState, string[]>;

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export const POLICY_ACTION_MASK_CHECKSUM = sha256(ACTION_MASKS);

function matchesCanonicalMasks(masks: Record<string, string[]>): boolean {
  const states = Object.keys(masks);
  return states.length === HMM_STATES.length && HMM_STATES.every((state) => {
    const actual = masks[state];
    const expected = ACTION_MASKS[state];
    return Array.isArray(actual)
      && actual.length === expected.length
      && actual.every((action, index) => action === expected[index]);
  });
}

export const PolicyActionMaskSnapshotV1Schema = z.object({
  revision: z.literal(POLICY_ACTION_MASK_REVISION),
  masks: z.record(z.string(), z.array(z.string().min(1))),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((snapshot, ctx) => {
  if (!matchesCanonicalMasks(snapshot.masks)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['masks'], message: 'action masks do not match the canonical policy router masks' });
  }
  if (snapshot.checksum !== POLICY_ACTION_MASK_CHECKSUM) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checksum'], message: 'action-mask checksum does not match the canonical policy router masks' });
  }
});

export const PolicyQloraAdmissionV1Schema = z.object({
  schema: z.literal('atlas.policy-qlora-admission.v1'),
  baseCheckpoint: z.object({
    modelRevision: z.string().trim().min(1),
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceQuantization: z.literal('NONE'),
  }).strict(),
  adapterTraining: z.object({
    quantizationBits: z.union([z.literal(4), z.literal(8)]),
    actionMask: PolicyActionMaskSnapshotV1Schema,
  }).strict(),
  executionState: z.literal('NOT_EXECUTED'),
  trainingAuthorized: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();

export type PolicyQloraAdmissionV1 = z.infer<typeof PolicyQloraAdmissionV1Schema>;

export function buildPolicyActionMaskSnapshotV1() {
  return {
    revision: POLICY_ACTION_MASK_REVISION,
    masks: Object.fromEntries(HMM_STATES.map((state) => [state, [...POLICY_ACTION_MASKS[state]]])),
    checksum: POLICY_ACTION_MASK_CHECKSUM,
  };
}

export function validatePolicyQloraAdmissionV1(input: unknown): PolicyQloraAdmissionV1 {
  return PolicyQloraAdmissionV1Schema.parse(input);
}
