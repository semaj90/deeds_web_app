// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { receiptChecksumV1, type CanonicalReceiptRecordV1, type ReceiptLookupResultV1 } from '../cache/receipt-dictionary-v1';
import { projectTaskProofLineV1 } from './task-proof-line-v1';
import workboardFixture from './task-proof-workboard-snapshot-v1.fixture.json';

const revision = 'sha256:' + 'a'.repeat(64);
const hit = (record: CanonicalReceiptRecordV1): ReceiptLookupResultV1 => ({ schema: 'atlas.receipt-dictionary.v1', status: 'HIT', reason: null, evicted: false, record });
const record = (receiptId: string, kind: 'TEST_EXECUTION' | 'VERIFIER_RESULT'): CanonicalReceiptRecordV1 => ({
  receiptKind: kind,
  receiptId,
  workspaceRevision: 'fixture-workspace',
  sourceRevision: revision,
  ...(kind === 'VERIFIER_RESULT' ? { verifierRevision: 'fixture-verifier-v1' } : {}),
  verificationStatus: kind === 'VERIFIER_RESULT' ? 'VERIFIED_PASS' : 'VERIFIED',
  committed: true,
  payload: kind === 'TEST_EXECUTION' ? { status: 'passed' } : {},
});

describe('task proof projection against frozen workboard inventory', () => {
  it('keeps all 16 duplicate blockHash groups distinct through explicit task and receipt references', () => {
    expect(workboardFixture.duplicateBlockHashGroups).toHaveLength(16);
    for (const [groupIndex, group] of workboardFixture.duplicateBlockHashGroups.entries()) {
      for (const [rowIndex, row] of group.rows.entries()) {
        const stableKey = row.stableKey;
        const testId = `test-${groupIndex}-${rowIndex}`;
        const verifierId = `verifier-${groupIndex}-${rowIndex}`;
        const task = {
          stableKey,
          sourceCheckboxState: row.sourceCheckboxState,
          blockHash: group.blockHash,
          declared: { proofReceiptId: testId },
        };
        const testRecord = record(testId, 'TEST_EXECUTION');
        const verifierRecord = record(verifierId, 'VERIFIER_RESULT');
        const result = projectTaskProofLineV1({
          task,
          mapping: new Map([[stableKey, [verifierId]]]),
          receipts: [hit(testRecord), hit(verifierRecord)],
          currentSourceRevision: revision,
          blockHashGroupSize: group.rows.length,
          receiptClaimants: new Map([[testId, [stableKey]], [verifierId, [stableKey]]]),
          completionGrant: true,
          featureLabel: 'proposal only',
        });
        expect(result.status).toBe('COMPLETION_AUTHORIZED');
        expect(result.receiptIds).toEqual([testId, verifierId]);
        expect(result.warnings).toContain('AMBIGUOUS_BLOCK_HASH');
        expect(result.featureLabel).toEqual({ value: 'proposal only', status: 'PROPOSED', canonicalAuthority: false });
      }
    }
  });

  it('keeps the real unresolved workboard task unresolved', () => {
    expect(workboardFixture.unresolvedTask.stableKey).toBe('agent-branch-review-fanout-ace-centroid-aug22#16f4feb094087a07');
    const result = projectTaskProofLineV1({
      task: workboardFixture.unresolvedTask,
      mapping: null,
      receipts: [],
      currentSourceRevision: revision,
      blockHashGroupSize: 1,
      completionGrant: true,
      featureLabel: null,
    });
    expect(result).toMatchObject({ status: 'UNRESOLVED_TASK_MAPPING', completionAuthorized: false, receiptIds: [] });
  });

  it('fixture is tied to the current report bytes and exact block identities', () => {
    expect(workboardFixture.sourceReportSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(workboardFixture.taskCount).toBe(13974);
    expect(workboardFixture.unresolvedTask.blockHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receiptChecksumV1(record('checksum-check', 'TEST_EXECUTION'))).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
