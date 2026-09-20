import { describe, expect, it } from 'vitest';
import { buildErrorAgentExecutionReceiptV1 } from './execution-receipt.js';
import { mapErrorAgentExecutionReceiptToAgentWorkReceiptV1 } from './execution-receipt-agent-work-adapter.js';
import { buildErrorAgentRepairRequestV1 } from './repair-request.js';
import { validateAgentWorkReceiptV1 } from '$lib/server/observability/agent-work-receipt-v1.js';

const request = buildErrorAgentRepairRequestV1({
  taskKey: 'fixture:agent-work-adapter',
  change: 'parent-atlas-agentic-completion',
  completionEnvelopeRevision: 'envelope-v1',
  controllerReportChecksum: 'sha256:controller',
  blockerKey: null,
  requiredReceipts: [],
  smokeProfile: 'controller-report',
}, { requestId: 'repair:agent-work-adapter' });

describe('error-agent receipt owner adapter', () => {
  it('maps into the existing AgentWorkReceiptV1 owner without persistence', () => {
    const execution = buildErrorAgentExecutionReceiptV1(request, {
      schema: 'atlas.error-agent-repair-dispatch.v1',
      status: 'DISPATCHED',
      queue: 'atlas.error-agent.repair.v1',
      requestId: request.requestId,
      reason: 'WORKER_QUEUE_ACCEPTED_IMMUTABLE_REQUEST',
      canonicalWritesAllowed: false,
      promotionAuthorized: false,
    }, 'ACK', { ok: true, proofRefs: ['receipt:adapter'] });
    const binding = mapErrorAgentExecutionReceiptToAgentWorkReceiptV1(request, execution, {
      startedAt: '2026-09-19T00:00:00.000Z',
      completedAt: '2026-09-19T00:00:01.000Z',
      elapsedMs: 1000,
    });

    expect(binding.owner).toBe('AgentWorkReceiptV1');
    expect(binding.store).toBe('recordAgentWorkReceiptV1');
    expect(binding.persistenceAuthorized).toBe(false);
    expect(binding.writesPerformed).toBe(false);
    expect(validateAgentWorkReceiptV1(binding.receipt)).toEqual(binding.receipt);
  });
});
