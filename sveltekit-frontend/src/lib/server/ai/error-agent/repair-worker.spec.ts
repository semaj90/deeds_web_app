import { describe, expect, it, vi } from 'vitest';
import { buildErrorAgentRepairRequestV1 } from './repair-request.js';
import { ERROR_AGENT_REPAIR_QUEUE } from './repair-dispatch.js';
import {
  evaluateRepairWorkerVerifierGateV1,
  executeErrorAgentRepairRequestV1,
  startErrorAgentRepairWorker,
} from './repair-worker.js';

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

  it('blocks execution on T2_DIAGNOSE_ONLY, T1_SPEC_FILE_ON_DISK, missing T0 verifierCmd, and turn > 3', async () => {
    const mkReq = (overrides: Record<string, unknown>) =>
      buildErrorAgentRepairRequestV1(
        {
          taskKey: 'task:verifier-gate',
          change: 'parent-atlas-agentic-completion',
          completionEnvelopeRevision: 'envelope-v1',
          controllerReportChecksum: 'sha256:controller',
          blockerKey: null,
          requiredReceipts: [],
          smokeProfile: 'controller-report',
        },
        {
          requestId: 'repair:verifier-gate',
          workflowInput: {
            query: 'repair target',
            hmmErrorClass: 'route_contract_mismatch',
            ...overrides,
          },
        },
      );

    const t2Req = mkReq({ verifierTier: 'T2_DIAGNOSE_ONLY', verifierCmd: null, turn: 1 });
    expect(evaluateRepairWorkerVerifierGateV1(t2Req)).toEqual({
      allowed: false,
      reason: 'DIAGNOSE_ONLY_NO_PATCH',
    });
    expect(await executeErrorAgentRepairRequestV1(t2Req)).toEqual({
      ok: false,
      proofRefs: [],
      reason: 'DIAGNOSE_ONLY_NO_PATCH',
    });

    const t1Req = mkReq({
      verifierTier: 'T1_SPEC_FILE_ON_DISK',
      verifierCmd: 'node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs',
      turn: 1,
    });
    expect(evaluateRepairWorkerVerifierGateV1(t1Req)).toEqual({
      allowed: false,
      reason: 'BLOCKED_MISSING_T0_VERIFIER',
    });

    const t0MissingCmdReq = mkReq({
      verifierTier: 'T0_RUNNABLE_VERIFIER',
      verifierCmd: '   ',
      turn: 1,
    });
    expect(evaluateRepairWorkerVerifierGateV1(t0MissingCmdReq)).toEqual({
      allowed: false,
      reason: 'BLOCKED_MISSING_T0_VERIFIER',
    });

    const turnCapReq = mkReq({
      verifierTier: 'T0_RUNNABLE_VERIFIER',
      verifierCmd: 'node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs',
      turn: 4,
    });
    expect(evaluateRepairWorkerVerifierGateV1(turnCapReq)).toEqual({
      allowed: false,
      reason: 'AGENTIC_TURN_CAP_EXCEEDED',
    });
  });
});
