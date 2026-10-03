import { describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('$lib/server/db/client', () => ({ db: { execute } }));

import { buildErrorAgentExecutionReceiptV1 } from './execution-receipt.js';
import { mapErrorAgentExecutionReceiptToAgentWorkReceiptV1 } from './execution-receipt-agent-work-adapter.js';
import { buildErrorAgentRepairRequestV1 } from './repair-request.js';
import { recordAgentWorkReceiptV1 } from '$lib/server/observability/agent-work-receipt-store-v1.js';
import { agentWorkReceiptChecksumV1 } from '$lib/server/observability/agent-work-receipt-v1.js';

describe('governed error-agent receipt handoff', () => {
  it('maps the plan-only execution receipt to the existing store and proves replay/conflict behavior', async () => {
    const request = buildErrorAgentRepairRequestV1(
      {
        taskKey: 'fixture:receipt-handoff',
        change: 'parent-atlas-agentic-completion',
        completionEnvelopeRevision: 'envelope-v1',
        controllerReportChecksum: 'sha256:controller',
        blockerKey: null,
        requiredReceipts: [],
        smokeProfile: 'controller-report',
      },
      {
        requestId: 'repair:receipt-handoff',
        workflowInput: {
          query: 'validate the governed receipt handoff',
          hmmErrorClass: 'route_contract_mismatch',
          threadId: 'thread:receipt-handoff',
        },
      },
    );
    const dispatch = {
      schema: 'atlas.error-agent-repair-dispatch.v1' as const,
      status: 'DISPATCHED' as const,
      queue: 'atlas.error-agent.repair.v1',
      requestId: request.requestId,
      reason: 'WORKER_QUEUE_ACCEPTED_IMMUTABLE_REQUEST',
      canonicalWritesAllowed: false as const,
      promotionAuthorized: false as const,
    };
    const execution = buildErrorAgentExecutionReceiptV1(
      request,
      dispatch,
      'ACK',
      { ok: true, proofRefs: ['receipt:handoff-smoke'] },
      { reconciliationStatus: 'REVIEW_REQUIRED' },
    );
    const binding = mapErrorAgentExecutionReceiptToAgentWorkReceiptV1(request, execution, {
      startedAt: '2026-09-19T00:00:00.000Z',
      completedAt: '2026-09-19T00:00:01.000Z',
      elapsedMs: 1000,
    });

    expect(binding.persistenceAuthorized).toBe(false);
    expect(binding.writesPerformed).toBe(false);
    expect(binding.receipt.writesPerformed).toBe(false);

    execute.mockResolvedValueOnce({ rows: [{ id: 'ledger-handoff-1' }] });
    await expect(recordAgentWorkReceiptV1(binding.receipt)).resolves.toMatchObject({
      acknowledged: true,
      replayed: false,
      receiptId: request.requestId,
    });

    execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ id: 'ledger-handoff-1', completion_checksum: agentWorkReceiptChecksumV1(binding.receipt) }],
    });
    await expect(recordAgentWorkReceiptV1(binding.receipt)).resolves.toMatchObject({
      acknowledged: true,
      replayed: true,
    });

    execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ id: 'ledger-handoff-1', completion_checksum: `sha256:${'f'.repeat(64)}` }],
    });
    await expect(recordAgentWorkReceiptV1(binding.receipt)).rejects.toThrow(
      'AGENT_WORK_RECEIPT_CHECKSUM_CONFLICT',
    );
  });
});
