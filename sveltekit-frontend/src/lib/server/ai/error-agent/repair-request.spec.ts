import { describe, expect, it } from 'vitest';
import type { OpenSpecTaskSelection } from './openspec-controller.js';
import { buildErrorAgentRepairRequestV1, verifyErrorAgentRepairRequestV1 } from './repair-request.js';

const selection: OpenSpecTaskSelection = {
  taskKey: 'fixture:actionable',
  change: 'safe-contract',
  line: 12,
  text: 'run a bounded fixture smoke',
  priority: 10,
  controllerState: 'ACTIONABLE',
  blockerKey: null,
  requiredReceipts: ['FIXTURE_REPLAY_PROVEN'],
  smokeProfile: 'controller-report',
  completionEnvelopeRevision: 'envelope-v1',
  controllerReportChecksum: 'sha256:controller',
  selectionReason: 'explicit_actionable_task_revalidated',
  evidenceHash: 'sha256:evidence',
};

describe('ErrorAgentRepairRequestV1', () => {
  it('binds the selected task and remains plan-only', () => {
    const request = buildErrorAgentRepairRequestV1(selection, { requestId: 'repair:test-1' });
    expect(request.mode).toBe('PLAN_ONLY');
    expect(request.canonicalWritesAllowed).toBe(false);
    expect(request.promotionAuthorized).toBe(false);
    expect(verifyErrorAgentRepairRequestV1(request)).toBe(true);
  });

  it('rejects tampering with selection or authority flags', () => {
    const request = buildErrorAgentRepairRequestV1(selection, { requestId: 'repair:test-2' });
    expect(verifyErrorAgentRepairRequestV1({ ...request, taskKey: 'other-task' })).toBe(false);
    expect(verifyErrorAgentRepairRequestV1({ ...request, promotionAuthorized: true })).toBe(false);
  });

  it('binds workflow input and rejects invalid smoke or classifier values', () => {
    const request = buildErrorAgentRepairRequestV1(selection, {
      requestId: 'repair:test-3',
      workflowInput: {
        query: 'validate the selected task',
        hmmErrorClass: 'route_contract_mismatch',
        threadId: 'thread:bound',
      },
    });

    expect(verifyErrorAgentRepairRequestV1(request)).toBe(true);
    expect(verifyErrorAgentRepairRequestV1({
      ...request,
      smokeProfile: 'arbitrary-shell',
    })).toBe(false);
    expect(verifyErrorAgentRepairRequestV1({
      ...request,
      workflowInput: { ...request.workflowInput!, hmmErrorClass: 'not-a-class' as never },
    })).toBe(false);
  });
});
