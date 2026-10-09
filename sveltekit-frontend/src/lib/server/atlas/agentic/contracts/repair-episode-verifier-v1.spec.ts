import { describe, expect, it } from 'vitest';
import { buildRepairEpisodeOutcomesV1, deriveTaskIdFromCandidate, repairErrorFingerprintV1, verifyRepairEpisodeV1 } from './repair-episode-verifier-v1.js';
import { isTrainingEligible } from './learning-outcome-v1.js';

const W = 'sha256:ws';
const snap = (fingerprints: string[]) => ({ workspaceRevision: W, sourceRevision: 'sha256:src', fingerprints });
const U0 = '4812677c-01a6-4d77-a6f2-d3840d400d11';
const U1 = 'c64be8ac-3847-4401-8341-69c9504e7cd0';

describe('verifyRepairEpisodeV1 (fixtures only)', () => {
  it('PASS: target gone and nothing new', () => {
    expect(verifyRepairEpisodeV1({ before: snap(['a', 'b']), after: snap(['b']), targetFingerprints: ['a'] }).verdict).toBe('PASS');
  });
  it('REGRESSED: target gone but a new fingerprint appears', () => {
    const v = verifyRepairEpisodeV1({ before: snap(['a', 'b']), after: snap(['b', 'c']), targetFingerprints: ['a'] });
    expect(v.verdict).toBe('REGRESSED');
    expect(v.newFingerprints).toEqual(['c']);
    expect(v).toMatchObject({ targetFingerprintCountBefore: 1, targetFingerprintCountAfter: 0, newFingerprintCount: 1 });
    expect(v.beforeEvidenceChecksum).not.toBe(v.afterEvidenceChecksum);
  });
  it('FAILURE: target remains', () => {
    const v = verifyRepairEpisodeV1({ before: snap(['a']), after: snap(['a']), targetFingerprints: ['a'] });
    expect(v.verdict).toBe('FAILURE');
    expect(v.targetRemaining).toEqual(['a']);
  });
  it('rejects mismatched revisions, empty targets and targets absent from before-evidence', () => {
    expect(() => verifyRepairEpisodeV1({ before: snap(['a']), after: { ...snap([]), workspaceRevision: 'other' }, targetFingerprints: ['a'] })).toThrow('REPAIR_EVIDENCE_WORKSPACE_REVISION_MISMATCH');
    expect(() => verifyRepairEpisodeV1({ before: snap(['a']), after: snap([]), targetFingerprints: [] })).toThrow('REPAIR_TARGET_FINGERPRINTS_EMPTY');
    expect(() => verifyRepairEpisodeV1({ before: snap(['a']), after: snap([]), targetFingerprints: ['zzz'] })).toThrow('REPAIR_TARGET_NOT_IN_BEFORE_EVIDENCE');
  });
  it('is deterministic', () => {
    const a = verifyRepairEpisodeV1({ before: snap(['a', 'b']), after: snap(['b']), targetFingerprints: ['a'] });
    const b = verifyRepairEpisodeV1({ before: snap(['b', 'a']), after: snap(['b']), targetFingerprints: ['a'] });
    expect(a.checksum).toBe(b.checksum);
  });
});

describe('line-insensitive fingerprints and multiset comparison', () => {
  const fp = (file: string, code: string, message: string) => repairErrorFingerprintV1({ file, code, message });
  it('ignores line shifts, path separators and whitespace, but not file, code or message', () => {
    expect(fp('src\\a.ts', 'TS2339', "Property  'x' does not exist")).toBe(fp('./src/a.ts', 'TS2339', "Property 'x' does not exist"));
    expect(fp('src/a.ts', 'TS2339', 'm')).not.toBe(fp('src/b.ts', 'TS2339', 'm'));
    expect(fp('src/a.ts', 'TS2339', 'm')).not.toBe(fp('src/a.ts', 'TS2322', 'm'));
    expect(fp('src/a.ts', 'TS2339', 'm')).not.toBe(fp('src/a.ts', 'TS2339', 'n'));
  });
  it('an edit that only shifts lines is not a regression (untouched errors keep their fingerprint)', () => {
    const target = fp('a.ts', 'TS1', 'fixed me'); const untouched = fp('a.ts', 'TS2', 'still here');
    const v = verifyRepairEpisodeV1({ before: snap([target, untouched]), after: snap([untouched]), targetFingerprints: [target] });
    expect(v.verdict).toBe('PASS');
    expect(v.newFingerprints).toEqual([]);
  });
  it('fixing one of three identical errors counts; fixing none is FAILURE; adding another is FAILURE', () => {
    const t = fp('a.ts', 'TS1', 'dup');
    expect(verifyRepairEpisodeV1({ before: snap([t, t, t]), after: snap([t, t]), targetFingerprints: [t] }).verdict).toBe('PASS');
    expect(verifyRepairEpisodeV1({ before: snap([t, t, t]), after: snap([t, t, t]), targetFingerprints: [t] }).verdict).toBe('FAILURE');
    expect(verifyRepairEpisodeV1({ before: snap([t, t]), after: snap([t, t, t]), targetFingerprints: [t] }).verdict).toBe('FAILURE');
  });
  it('a new instance of a non-target error is a regression', () => {
    const t = fp('a.ts', 'TS1', 't'); const o = fp('b.ts', 'TS9', 'o');
    expect(verifyRepairEpisodeV1({ before: snap([t, o]), after: snap([o, o]), targetFingerprints: [t] }).verdict).toBe('REGRESSED');
  });
});

describe('repair episode outcomes', () => {
  const taskId = deriveTaskIdFromCandidate({ workspaceRevision: W, sourceRevision: 'sha256:src', targetFingerprints: ['a'] });
  const build = (after: string[]) => buildRepairEpisodeOutcomesV1({
    taskId, toolName: 'repair.apply', repairAttemptId: 'ra-1',
    attempt0: { executionId: U0 }, attempt1: { executionId: U1, evidenceRefs: ['receipt:r1'], validatorReceiptId: 'vr-1' },
    verification: verifyRepairEpisodeV1({ before: snap(['a', 'b']), after: snap(after), targetFingerprints: ['a'] }),
  });
  it('derives a stable taskId from the candidate', () => {
    expect(taskId).toBe(deriveTaskIdFromCandidate({ workspaceRevision: W, sourceRevision: 'sha256:src', targetFingerprints: ['a'] }));
    expect(taskId).not.toBe(deriveTaskIdFromCandidate({ workspaceRevision: W, sourceRevision: 'sha256:src2', targetFingerprints: ['a'] }));
  });
  it('FAILURE then RECOVERED linked by retryOf, with a derived reward', () => {
    const { attempt0, attempt1 } = build(['b']);
    expect(attempt0.resultClass).toBe('FAILURE');
    expect(attempt1.resultClass).toBe('RECOVERED');
    expect(attempt1.retryOf).toBe(U0);
    expect(attempt1.reward?.components).toMatchObject({ validator: 1, taskCompleted: 1, successfulRepair: 1, regression: 0 });
    expect(attempt1.taskId).toBe(attempt0.taskId);
  });
  it('REGRESSED and FAILURE verdicts propagate', () => {
    expect(build(['b', 'c']).attempt1.resultClass).toBe('REGRESSED');
    expect(build(['a', 'b']).attempt1.resultClass).toBe('FAILURE');
  });
  it('is training-eligible only when an episode block exists is NOT required; validator/reward/evidence/taskId are', () => {
    const { attempt1 } = build(['b']);
    expect(isTrainingEligible(attempt1)).toBe(true);
  });
});
