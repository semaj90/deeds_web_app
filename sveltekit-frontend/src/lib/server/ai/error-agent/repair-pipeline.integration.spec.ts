import { describe, expect, it, vi } from 'vitest';
import { dispatchPlanOnlyRepairRequest } from './repair-dispatch.js';
import { buildErrorAgentRepairRequestV1 } from './repair-request.js';
import { startErrorAgentRepairWorker } from './repair-worker.js';

const request = buildErrorAgentRepairRequestV1({
  taskKey: 'fixture:transport',
  change: 'parent-atlas-agentic-completion',
  completionEnvelopeRevision: 'envelope-v1',
  controllerReportChecksum: 'sha256:controller',
  blockerKey: null,
  requiredReceipts: ['fixture:smoke'],
  smokeProfile: 'controller-report',
}, {
  requestId: 'repair:transport',
  workflowInput: {
    query: 'run the bounded transport fixture',
    hmmErrorClass: 'route_contract_mismatch',
    threadId: 'thread:transport',
  },
});

describe('governed repair publisher to worker lifecycle', () => {
  it('publishes, executes, and acknowledges one immutable plan-only request', async () => {
    let processMessage: ((payload: unknown, ack: () => void, nack: () => void) => Promise<void>) | undefined;
    const ack = vi.fn();
    const nack = vi.fn();
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      proofRefs: ['receipt:transport-fixture'],
    });

    const worker = await startErrorAgentRepairWorker({
      enabled: true,
      execute,
      consume: async (_queue, processor) => {
        processMessage = processor;
      },
    });

    const dispatch = await dispatchPlanOnlyRepairRequest(request, {
      enabled: true,
      publisher: {
        publish: async (_queue, payload) => {
          if (!processMessage) return false;
          await processMessage(payload, ack, nack);
          return true;
        },
      },
    });

    expect(worker.status).toBe('STARTED');
    expect(dispatch.status).toBe('DISPATCHED');
    expect(execute).toHaveBeenCalledWith(request);
    expect(ack).toHaveBeenCalledOnce();
    expect(nack).not.toHaveBeenCalled();
    expect(dispatch.canonicalWritesAllowed).toBe(false);
    expect(dispatch.promotionAuthorized).toBe(false);
  });
});

