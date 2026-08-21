import { describe, expect, it } from 'vitest';
import {
  buildGroundedContextManifestV1,
  buildGroundedExecutionReceiptV1,
  checksumGroundedContextManifestV1,
  digestClaimTokenV1,
  validateGroundedExecutionReceiptV1,
  verifyGroundedExecutionReceiptChecksumV1,
} from './grounded-execution-receipt-v1';

const CONTEXT_CHECKSUM = 'a'.repeat(64);
const OUTPUT_DIGEST = 'b'.repeat(64);

function context() {
  return buildGroundedContextManifestV1({
    taskId: 'task:1',
    runId: 'run:1',
    workerId: 'codex-worker',
    contextManifestSchema: 'atlas.context-manifest.v1',
    contextManifestChecksum: CONTEXT_CHECKSUM,
    requestId: 'request:1',
    snapshotId: 'snapshot:1',
    graphRevision: 'graph:1',
    producerRevision: 'context-compiler:v1',
    grounding: {
      packetKeys: ['packet:1'],
      processIds: ['process:1'],
      sourceRefs: ['src/example.ts'],
      evidenceRefs: ['evidence:1', 'evidence:2'],
    },
  });
}

function successReceipt() {
  const grounded = context();
  return buildGroundedExecutionReceiptV1({
    receiptId: 'execution:1',
    taskId: grounded.taskId,
    runId: grounded.runId,
    workerId: grounded.workerId,
    claimTokenDigest: digestClaimTokenV1('claim-secret'),
    groundedContextChecksum: checksumGroundedContextManifestV1(grounded),
    contextManifestChecksum: grounded.contextManifestChecksum,
    startedAt: '2026-08-21T12:00:00.000Z',
    finishedAt: '2026-08-21T12:00:01.000Z',
    status: 'SUCCESS',
    executor: 'codex',
    executorRevision: 'codex:v1',
    mutationRefs: ['mutation:1'],
    outputRefs: ['output:1'],
    validation: [{
      validationId: 'validation:1',
      command: 'npx vitest run example.spec.ts',
      status: 'PASSED',
      exitCode: 0,
      startedAt: '2026-08-21T12:00:00.500Z',
      finishedAt: '2026-08-21T12:00:00.900Z',
      evidenceRefs: ['evidence:2'],
      outputDigest: OUTPUT_DIGEST,
    }],
    evidenceRefs: ['evidence:1', 'evidence:2'],
  });
}

describe('GroundedExecutionReceiptV1', () => {
  it('accepts a receipt whose task, run, worker, claim, context and validation agree', () => {
    const grounded = context();
    const receipt = successReceipt();
    expect(verifyGroundedExecutionReceiptChecksumV1(receipt)).toBe(true);
    expect(validateGroundedExecutionReceiptV1({
      receipt,
      groundedContext: grounded,
      currentTask: {
        taskId: 'task:1',
        currentRunId: 'run:1',
        assignee: 'codex-worker',
        claimToken: 'claim-secret',
      },
    })).toEqual({ ok: true });
  });

  it('rejects SUCCESS without executable validation evidence', () => {
    const grounded = context();
    expect(() => buildGroundedExecutionReceiptV1({
      receiptId: 'execution:missing-validation',
      taskId: grounded.taskId,
      runId: grounded.runId,
      workerId: grounded.workerId,
      claimTokenDigest: digestClaimTokenV1('claim-secret'),
      groundedContextChecksum: checksumGroundedContextManifestV1(grounded),
      contextManifestChecksum: grounded.contextManifestChecksum,
      startedAt: '2026-08-21T12:00:00.000Z',
      finishedAt: '2026-08-21T12:00:01.000Z',
      status: 'SUCCESS',
      executor: 'codex',
      executorRevision: 'codex:v1',
      mutationRefs: [],
      outputRefs: [],
      validation: [],
      evidenceRefs: ['evidence:1'],
    })).toThrow('EXECUTION_SUCCESS_REQUIRES_PASSED_VALIDATION');
  });

  it('rejects a receipt from a stale run', () => {
    const result = validateGroundedExecutionReceiptV1({
      receipt: successReceipt(),
      groundedContext: context(),
      currentTask: {
        taskId: 'task:1',
        currentRunId: 'run:2',
        assignee: 'codex-worker',
        claimToken: 'claim-secret',
      },
    });
    expect(result).toEqual({ ok: false, blockers: expect.arrayContaining(['RUN_ID_MISMATCH']) });
  });

  it('rejects a receipt that cannot prove the active claim', () => {
    const result = validateGroundedExecutionReceiptV1({
      receipt: successReceipt(),
      groundedContext: context(),
      currentTask: {
        taskId: 'task:1',
        currentRunId: 'run:1',
        assignee: 'codex-worker',
        claimToken: 'different-claim',
      },
    });
    expect(result).toEqual({ ok: false, blockers: expect.arrayContaining(['CLAIM_TOKEN_MISMATCH']) });
  });

  it('rejects execution evidence that was not admitted by the grounded context', () => {
    const grounded = context();
    const original = successReceipt();
    const rebuilt = buildGroundedExecutionReceiptV1({
      ...original,
      receiptId: 'execution:ungrounded',
      evidenceRefs: ['evidence:1', 'evidence:not-in-context'],
    });
    const result = validateGroundedExecutionReceiptV1({
      receipt: rebuilt,
      groundedContext: grounded,
      currentTask: {
        taskId: 'task:1',
        currentRunId: 'run:1',
        assignee: 'codex-worker',
        claimToken: 'claim-secret',
      },
    });
    expect(result).toEqual({ ok: false, blockers: expect.arrayContaining(['EXECUTION_EVIDENCE_NOT_GROUNDED']) });
  });

  it('detects receipt content tampering', () => {
    const receipt = successReceipt();
    const tampered = { ...receipt, outputRefs: ['output:tampered'] };
    expect(verifyGroundedExecutionReceiptChecksumV1(tampered)).toBe(false);
  });
});
