import { describe, expect, it } from 'vitest';
import {
  buildEvidenceCardV1,
  buildEvidenceReceiptV1,
  deriveOpenSpecProofState,
  verifyEvidenceReceiptV1,
} from './openspec-evidence-fabric-v1.js';

const baseReceipt = {
  schema: 'atlas.evidence-receipt.v1' as const,
  evidenceId: 'receipt:task-1:run-1',
  evidenceType: 'TEST' as const,
  changeId: 'change-a',
  taskId: 'TASK-1',
  claim: 'The task contract validates',
  workspaceRevision: `sha256:${'1'.repeat(64)}`,
  sourceRevision: `sha256:${'2'.repeat(64)}`,
  taskRevision: `sha256:${'4'.repeat(64)}`,
  sourceRefs: [{ file: 'src/example.ts', lineStart: 1, lineEnd: 4, sourceRevision: `sha256:${'2'.repeat(64)}` }],
  environmentFingerprint: `sha256:${'3'.repeat(64)}`,
  producer: 'vitest',
  command: 'vitest run',
  inputs: [{ kind: 'source', uri: 'src/example.ts', sourceRef: 'src/example.ts#L1' }],
  observedAt: '2026-10-01T12:00:00Z',
  exitCode: 0,
  expectedAssertions: [{ id: 'assert-1', expected: 'receipt schema validates' }],
  actualAssertions: [{ id: 'assert-1', actual: 'receipt schema validates', passed: true }],
  outputs: [{ kind: 'report', uri: 'docs/reports/receipt.json' }],
  verifier: 'independent-audit',
  independentVerifier: 'independent-audit-run-2',
  readbackRequired: true,
  readbackPerformed: true,
  readbackCommand: 'readback',
  verdict: 'PROVEN' as const,
};

describe('OpenSpec evidence fabric contracts', () => {
  it('builds and verifies revision-bound receipts', () => {
    const receipt = buildEvidenceReceiptV1(baseReceipt);
    expect(verifyEvidenceReceiptV1(receipt)).toEqual(receipt);
    expect(() => verifyEvidenceReceiptV1({ ...receipt, claim: 'tampered' })).toThrow(/checksum/);
  });

  it('preserves predicate claim references through strict receipt validation', () => {
    const claimRef = `sha256:${'a'.repeat(64)}`;
    const receipt = buildEvidenceReceiptV1({
      ...baseReceipt,
      expectedAssertions: [{ id: 'assert-1', expected: 'pass', claimRef }],
      actualAssertions: [{ id: 'assert-1', actual: 'pass', passed: true, claimRef }],
    });
    expect(verifyEvidenceReceiptV1(receipt).actualAssertions[0].claimRef).toBe(claimRef);
    expect(() => buildEvidenceReceiptV1({
      ...baseReceipt,
      expectedAssertions: [{ id: 'assert-1', expected: 'pass', claimRef }],
      actualAssertions: [{ id: 'assert-1', actual: 'pass', passed: true, claimRef: `sha256:${'b'.repeat(64)}` }],
    })).toThrow(/claimRef must match/);
  });

  it('requires a task-block revision when creating receipts', () => {
    expect(() => buildEvidenceReceiptV1({ ...baseReceipt, taskRevision: undefined } as never)).toThrow();
  });

  it('does not promote stale receipts', () => {
    const receipt = buildEvidenceReceiptV1(baseReceipt);
    expect(deriveOpenSpecProofState({ declaredChecked: true, currentWorkspaceRevision: `sha256:${'4'.repeat(64)}`, currentSourceRevision: receipt.sourceRevision, receipts: [receipt] })).toBe('STALE');
    expect(deriveOpenSpecProofState({ declaredChecked: false, currentWorkspaceRevision: receipt.workspaceRevision, currentSourceRevision: receipt.sourceRevision, receipts: [receipt] })).toBe('PROVEN');
    expect(deriveOpenSpecProofState({ declaredChecked: true, currentWorkspaceRevision: receipt.workspaceRevision, currentSourceRevision: `sha256:${'5'.repeat(64)}`, receipts: [receipt] })).toBe('STALE');
  });

  it('rejects PROVEN receipts without independent verification, complete assertions, or required readback', () => {
    expect(() => buildEvidenceReceiptV1({ ...baseReceipt, independentVerifier: undefined })).toThrow(/independent verifier/);
    expect(() => buildEvidenceReceiptV1({ ...baseReceipt, actualAssertions: [] })).toThrow();
    expect(() => buildEvidenceReceiptV1({ ...baseReceipt, actualAssertions: [{ id: 'assert-1', actual: 'failed', passed: false }] })).toThrow(/unsatisfied assertion/);
    expect(() => buildEvidenceReceiptV1({ ...baseReceipt, readbackPerformed: false })).toThrow(/readback/);
  });

  it('builds bounded ACE evidence cards with checksums', () => {
    const card = buildEvidenceCardV1({
      schema: 'atlas.evidence-card.v1',
      taskRef: 'openspec/changes/change-a/tasks.md#L10',
      changeId: 'change-a',
      taskId: 'TASK-1',
      claim: 'The task contract validates',
      proofState: 'PROVEN',
      sourceRef: 'openspec/changes/change-a/tasks.md#L10',
      conceptID: 'openspec:change-a:TASK-1',
      confidenceScore: 1,
      contextBlob: 'PROVEN: vitest receipt receipt:task-1:run-1',
      evidenceIds: ['receipt:task-1:run-1'],
      workspaceRevision: 'sha256:workspace-1',
      retrievalUsable: true,
      proofUsable: false,
      rejectionReasons: ['NON_CANONICAL'],
    });
    expect(card.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(card.retrievalUsable).toBe(true);
    expect(card.proofUsable).toBe(false);
    expect(card.rejectionReasons).toEqual(['NON_CANONICAL']);
  });

  it('never promotes diagnostic retrieval context into proof authority', () => {
    expect(() => buildEvidenceCardV1({
      schema: 'atlas.evidence-card.v1',
      taskRef: 'openspec/changes/change-a/tasks.md#L10',
      changeId: 'change-a',
      taskId: 'TASK-1',
      claim: 'The task claim is only diagnostic context',
      proofState: 'CLAIM_ONLY',
      sourceRef: 'openspec/changes/change-a/tasks.md#L10',
      conceptID: 'openspec:change-a:TASK-1',
      confidenceScore: 0,
      contextBlob: 'Diagnostic only',
      evidenceIds: [],
      workspaceRevision: 'sha256:workspace-1',
      retrievalUsable: true,
      proofUsable: true,
      rejectionReasons: ['EXPIRED', 'MISSING_SOURCE_REVISION', 'NON_CANONICAL', 'IDENTITY_CONFLICT'],
    })).toThrow(/proofUsable requires PROVEN/);
  });

});
