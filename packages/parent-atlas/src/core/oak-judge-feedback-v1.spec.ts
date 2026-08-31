import { describe, expect, it } from 'vitest';
import { buildOakJudgeFeedbackV1, oakJudgeFeedbackV1Schema, OAK_JUDGE_FAILURE_CLASS_VALUES } from './oak-judge-feedback-v1.js';
import { buildF02ValidatorFailureFixtureV0 } from './oak-judge-feedback-f02-fixture-v0.js';

const baseInput = {
  feedbackId: 'judge-feedback:test:v0',
  kernelRevision: 'kernel-schema:test:v0',
  workflowRunId: 'run:test',
  failureClass: 'VALIDATOR_FAILURE' as const,
  evidenceRefs: ['evidence:1'],
  confidence: 0.5,
  judgeRevision: 'judge:test:v0',
};

describe('buildOakJudgeFeedbackV1', () => {
  it('requires at least one proposed patch', () => {
    expect(() => buildOakJudgeFeedbackV1(baseInput)).toThrow();
  });

  it('refuses both a schema patch and a function patch on one record', () => {
    expect(() => buildOakJudgeFeedbackV1({
      ...baseInput,
      proposedSchemaPatch: { patchKind: 'ADD_CONCEPT', targetSchemaRevision: 'rev', description: 'x' },
      proposedFunctionPatch: { patchKind: 'ADD_REQUIRED_FIELD', targetFunctionId: 'fn', targetFunctionRevision: 'rev', description: 'x' },
    })).toThrow();
  });

  it('builds a valid record with exactly one proposed patch, checksum-sealed', () => {
    const feedback = buildOakJudgeFeedbackV1({
      ...baseInput,
      proposedFunctionPatch: { patchKind: 'ADD_REQUIRED_FIELD', targetFunctionId: 'fn', targetFunctionRevision: 'rev', description: 'x' },
    });
    expect(oakJudgeFeedbackV1Schema.parse(feedback)).toEqual(feedback);
    expect(feedback.canonicalAuthority).toBe(false);
    expect(feedback.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('every failure class in the fixed vocabulary round-trips through the schema', () => {
    for (const failureClass of OAK_JUDGE_FAILURE_CLASS_VALUES) {
      const feedback = buildOakJudgeFeedbackV1({
        ...baseInput,
        failureClass,
        proposedSchemaPatch: { patchKind: 'ADD_CONCEPT', targetSchemaRevision: 'rev', description: 'x' },
      });
      expect(feedback.failureClass).toBe(failureClass);
    }
  });
});

describe('buildF02ValidatorFailureFixtureV0', () => {
  it('produces a real, schema-valid VALIDATOR_FAILURE record grounded in the actual F02 event', () => {
    const fixture = buildF02ValidatorFailureFixtureV0();
    expect(fixture.failureClass).toBe('VALIDATOR_FAILURE');
    expect(fixture.proposedFunctionPatch).not.toBeNull();
    expect(fixture.proposedSchemaPatch).toBeNull();
    expect(fixture.evidenceRefs.length).toBeGreaterThan(0);
    expect(fixture.executionReceiptRefs.length).toBeGreaterThan(0);
    expect(fixture.confidence).toBe(1);
    expect(fixture.canonicalAuthority).toBe(false);
  });

  it('is deterministic — building it twice yields the same checksum', () => {
    const a = buildF02ValidatorFailureFixtureV0();
    const b = buildF02ValidatorFailureFixtureV0();
    expect(a.checksum).toBe(b.checksum);
  });
});
