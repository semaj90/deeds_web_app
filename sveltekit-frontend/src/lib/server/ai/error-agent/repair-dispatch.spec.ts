import { describe, expect, it, vi } from 'vitest';
import { buildErrorAgentRepairRequestV1 } from './repair-request.js';
import { dispatchPlanOnlyRepairRequest, ERROR_AGENT_REPAIR_QUEUE } from './repair-dispatch.js';

const request = buildErrorAgentRepairRequestV1({
  taskKey: 'task:fixture',
  change: 'parent-atlas-agentic-completion',
  completionEnvelopeRevision: 'envelope-v1',
  controllerReportChecksum: 'sha256:controller',
  blockerKey: null,
  requiredReceipts: ['receipt:smoke'],
  smokeProfile: 'controller-report',
}, { requestId: 'repair:fixture' });

describe('repair dispatch boundary', () => {
  it('stays plan-only and does not publish by default', async () => {
    const publish = vi.fn();
    const outcome = await dispatchPlanOnlyRepairRequest(request, {
      publisher: { publish },
    });

    expect(outcome.status).toBe('NOT_DISPATCHED');
    expect(outcome.reason).toBe('PLAN_ONLY_DISPATCH_DISABLED');
    expect(outcome.queue).toBe(ERROR_AGENT_REPAIR_QUEUE);
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes only an intact immutable request when explicitly enabled', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    const outcome = await dispatchPlanOnlyRepairRequest(request, {
      enabled: true,
      publisher: { publish },
    });

    expect(outcome.status).toBe('DISPATCHED');
    expect(outcome.canonicalWritesAllowed).toBe(false);
    expect(outcome.promotionAuthorized).toBe(false);
    expect(publish).toHaveBeenCalledWith(ERROR_AGENT_REPAIR_QUEUE, request);
  });

  it('rejects tampered requests before reaching the publisher', async () => {
    const publish = vi.fn();
    const outcome = await dispatchPlanOnlyRepairRequest(
      { ...request, taskKey: 'task:tampered' },
      { enabled: true, publisher: { publish } },
    );

    expect(outcome.status).toBe('REJECTED');
    expect(outcome.reason).toBe('INVALID_REPAIR_REQUEST_CHECKSUM');
    expect(publish).not.toHaveBeenCalled();
  });
});
