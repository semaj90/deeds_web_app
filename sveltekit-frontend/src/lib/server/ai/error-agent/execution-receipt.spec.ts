import { describe, expect, it } from 'vitest';
import { buildErrorAgentRepairRequestV1 } from './repair-request.js';
import { buildErrorAgentExecutionReceiptV1, verifyErrorAgentExecutionReceiptV1 } from './execution-receipt.js';

const request = buildErrorAgentRepairRequestV1({
  taskKey: 'fixture:receipt',
  change: 'parent-atlas-agentic-completion',
  completionEnvelopeRevision: 'envelope-v1',
  controllerReportChecksum: 'sha256:controller',
  blockerKey: null,
  requiredReceipts: [],
  smokeProfile: 'controller-report',
}, { requestId: 'repair:receipt' });

const dispatch = {
  schema: 'atlas.error-agent-repair-dispatch.v1' as const,
  status: 'DISPATCHED' as const,
  queue: 'atlas.error-agent.repair.v1' as const,
  requestId: request.requestId,
  reason: 'WORKER_QUEUE_ACCEPTED_IMMUTABLE_REQUEST',
  canonicalWritesAllowed: false as const,
  promotionAuthorized: false as const,
};

describe('ErrorAgentExecutionReceiptV1', () => {
  it('is deterministic and explicitly noncanonical', () => {
    const execution = { ok: true, proofRefs: ['receipt:test'] };
    const a = buildErrorAgentExecutionReceiptV1(request, dispatch, 'ACK', execution);
    const b = buildErrorAgentExecutionReceiptV1(request, dispatch, 'ACK', execution);

    expect(a.checksum).toBe(b.checksum);
    expect(a.persistence).toBe('READ_ONLY_NOT_PERSISTED');
    expect(verifyErrorAgentExecutionReceiptV1(a)).toBe(true);
  });

  it('rejects authority or checksum tampering', () => {
    const receipt = buildErrorAgentExecutionReceiptV1(request, dispatch, 'ACK', { ok: true, proofRefs: [] });
    expect(verifyErrorAgentExecutionReceiptV1({ ...receipt, promotionAuthorized: true })).toBe(false);
    expect(verifyErrorAgentExecutionReceiptV1({ ...receipt, taskKey: 'other-task' })).toBe(false);
  });
});

