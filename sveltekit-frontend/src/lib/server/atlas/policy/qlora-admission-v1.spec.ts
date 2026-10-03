import { describe, expect, it } from 'vitest';
import { POLICY_ACTIONS } from './policy-types.js';
import {
  buildPolicyActionMaskSnapshotV1,
  validatePolicyQloraAdmissionV1,
} from './qlora-admission-v1.js';

const validAdmission = () => ({
  schema: 'atlas.policy-qlora-admission.v1',
  baseCheckpoint: {
    modelRevision: 'policy-base:r1',
    artifactSha256: 'a'.repeat(64),
    sourceQuantization: 'NONE',
  },
  adapterTraining: {
    quantizationBits: 4,
    actionMask: buildPolicyActionMaskSnapshotV1(),
  },
  executionState: 'NOT_EXECUTED',
  trainingAuthorized: false,
  canonicalAuthority: false,
});

describe('policy QLoRA admission contract', () => {
  it('admits a non-quantized source checkpoint with the exact current action mask', () => {
    const parsed = validatePolicyQloraAdmissionV1(validAdmission());
    expect(parsed.baseCheckpoint.sourceQuantization).toBe('NONE');
    expect(parsed.adapterTraining.actionMask.masks).toHaveProperty('REPAIR');
    expect(POLICY_ACTIONS).toContain('PATCH');
    expect(parsed.trainingAuthorized).toBe(false);
    expect(parsed.canonicalAuthority).toBe(false);
  });

  it('rejects a checkpoint that is already quantized', () => {
    const input = validAdmission();
    input.baseCheckpoint.sourceQuantization = '4BIT';
    expect(() => validatePolicyQloraAdmissionV1(input)).toThrow();
  });

  it('rejects changed or incomplete state-specific action masks', () => {
    const input = validAdmission();
    input.adapterTraining.actionMask.masks.REPAIR = ['PATCH'];
    expect(() => validatePolicyQloraAdmissionV1(input)).toThrow(/canonical policy router masks/);
  });

  it('treats state-map key order as serialization detail, not a semantic mask change', () => {
    const input = validAdmission();
    input.adapterTraining.actionMask.masks = Object.fromEntries(
      Object.entries(input.adapterTraining.actionMask.masks).reverse(),
    );
    expect(validatePolicyQloraAdmissionV1(input).adapterTraining.actionMask.checksum)
      .toBe(input.adapterTraining.actionMask.checksum);
  });

  it('rejects a stale action-mask checksum and cannot represent execution authorization', () => {
    const input = validAdmission();
    input.adapterTraining.actionMask.checksum = 'b'.repeat(64);
    expect(() => validatePolicyQloraAdmissionV1(input)).toThrow(/checksum/);
    expect(() => validatePolicyQloraAdmissionV1({ ...validAdmission(), trainingAuthorized: true })).toThrow();
  });
});
