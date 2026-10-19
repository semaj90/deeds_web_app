import { describe, expect, it, vi } from 'vitest';
import { buildErrorAgentRepairRequestV1 } from './repair-request.js';
import { ERROR_AGENT_REPAIR_QUEUE } from './repair-dispatch.js';
import { startErrorAgentRepairWorker } from './repair-worker.js';

const request = buildErrorAgentRepairRequestV1({
  taskKey: 'task:worker',
  change: 'parent-atlas-agentic-completion',
  completionEnvelopeRevision: 'envelope-v1',
  controllerReportChecksum: 'sha256:controller',
  blockerKey: null,
  requiredReceipts: [],
  smokeProfile: 'controller-report',
}, { requestId: 'repair:worker' });

describe('repair worker boundary', () => {
  it('does not register a consumer when disabled', async () => {
    const consume = vi.fn();
    const result = await startErrorAgentRepairWorker({
      enabled: false,
      execute: vi.fn(),
      consume: consume as never,
    });

    expect(result.status).toBe('NOT_STARTED');
    expect(consume).not.toHaveBeenCalled();
  });

  it('acknowledges only after successful execution', async () => {
    const ack = vi.fn();
    const nack = vi.fn();
    const execute = vi.fn().mockResolvedValue({ ok: true, proofRefs: ['receipt:test'] });
    const consume = vi.fn(async (queue, processor) => {
      expect(queue).toBe(ERROR_AGENT_REPAIR_QUEUE);
      await processor(request, ack, nack);
    });

    const result = await startErrorAgentRepairWorker({ enabled: true, execute, consume });

    expect(result.status).toBe('STARTED');
    expect(execute).toHaveBeenCalledWith(request);
    expect(ack).toHaveBeenCalledOnce();
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks invalid or failed work without acknowledging it', async () => {
    const ack = vi.fn();
    const nack = vi.fn();
    const execute = vi.fn().mockResolvedValue({ ok: false, proofRefs: [], reason: 'SMOKE_FAILED' });
    const consume = vi.fn(async (_queue, processor) => {
      await processor({ ...request, taskKey: 'tampered' }, ack, nack);
      await processor(request, ack, nack);
    });

    await startErrorAgentRepairWorker({ enabled: true, execute, consume });

    expect(execute).toHaveBeenCalledOnce();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledTimes(2);
  });

  it('does not nack an acknowledged delivery when the settlement observer fails', async () => {
    const ack = vi.fn();
    const nack = vi.fn();
    const consume = vi.fn(async (_queue, processor) => {
      await processor(request, ack, nack);
    });

    await startErrorAgentRepairWorker({
      enabled: true,
      execute: vi.fn().mockResolvedValue({ ok: true, proofRefs: ['receipt:test'] }),
      consume,
      onMessageSettled: vi.fn().mockRejectedValue(new Error('observer unavailable')),
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(nack).not.toHaveBeenCalled();
  });

  it('notifies a failed settlement only after issuing one nack', async () => {
    const ack = vi.fn();
    const nack = vi.fn();
    const consume = vi.fn(async (_queue, processor) => {
      await processor({ ...request, taskKey: 'tampered' }, ack, nack);
    });

    await startErrorAgentRepairWorker({
      enabled: true,
      execute: vi.fn(),
      consume,
      onMessageSettled: vi.fn().mockRejectedValue(new Error('observer unavailable')),
    });

    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledOnce();
  });
});
