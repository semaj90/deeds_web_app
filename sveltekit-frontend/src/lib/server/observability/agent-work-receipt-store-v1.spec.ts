import { describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('$lib/server/db/client', () => ({ db: { execute } }));

import { recordAgentWorkReceiptV1 } from './agent-work-receipt-store-v1.js';
import { agentWorkReceiptChecksumV1 } from './agent-work-receipt-v1.js';
import type { AgentWorkReceiptV1 } from './agent-work-receipt-v1.js';

const receipt: AgentWorkReceiptV1 = {
  schema: 'atlas.agent-work-receipt.v1', receiptId: 'receipt-store-1', runId: 'run-1', taskId: null,
  openspecChange: null, openspecTaskIds: ['MCP-OUTCOME-RECEIPT-ADAPTER-01'], agentId: null, modelId: null,
  modelRevision: null, startedAt: '2026-09-03T00:00:00.000Z', completedAt: '2026-09-03T00:00:01.000Z',
  elapsedMs: 1000, inputTokens: null, outputTokens: null, cachedTokens: null, estimatedCostUsd: null,
  workspaceRevision: 'workspace-r1', sourceRevision: null, graphRevision: null, representationRevision: null,
  toolRefs: [], registryRevision: null, inputChecksum: null, outputChecksum: null, filesObserved: [],
  filesEdited: [], commandsExecuted: [], validationReceipts: [], status: 'SUCCEEDED', writesPerformed: false,
  completionChecksum: null,
};

describe('AgentWorkReceipt Postgres store', () => {
  it('acknowledges a newly inserted receipt', async () => {
    execute.mockResolvedValueOnce({ rows: [{ id: 'ledger-1' }] });
    await expect(recordAgentWorkReceiptV1(receipt)).resolves.toMatchObject({
      ledgerId: 'ledger-1', receiptId: 'receipt-store-1', acknowledged: true, replayed: false,
    });
  });

  it('acknowledges identical replay and rejects checksum conflict', async () => {
    execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ id: 'ledger-1', completion_checksum: agentWorkReceiptChecksumV1(receipt) }],
    });
    await expect(recordAgentWorkReceiptV1(receipt)).resolves.toMatchObject({ replayed: true });

    execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ id: 'ledger-1', completion_checksum: 'sha256:' + 'f'.repeat(64) }],
    });
    await expect(recordAgentWorkReceiptV1(receipt)).rejects.toThrow('AGENT_WORK_RECEIPT_CHECKSUM_CONFLICT');
  });
});
