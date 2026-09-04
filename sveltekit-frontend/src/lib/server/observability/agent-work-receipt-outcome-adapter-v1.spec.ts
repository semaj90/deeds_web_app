import { describe, expect, it } from 'vitest';
import { mapAgentWorkReceiptToOutcomeLedgerV1 } from './agent-work-receipt-outcome-adapter-v1.js';
import type { AgentWorkReceiptV1 } from './agent-work-receipt-v1.js';

const receipt: AgentWorkReceiptV1 = {
  schema: 'atlas.agent-work-receipt.v1',
  receiptId: 'receipt-1',
  runId: 'run-1',
  taskId: 'not-a-uuid',
  openspecChange: null,
  openspecTaskIds: ['MCP-OUTCOME-RECEIPT-ADAPTER-01'],
  agentId: 'agent-1',
  modelId: 'model-1',
  modelRevision: null,
  startedAt: '2026-09-03T00:00:00.000Z',
  completedAt: null,
  elapsedMs: null,
  inputTokens: null,
  outputTokens: null,
  cachedTokens: null,
  estimatedCostUsd: null,
  workspaceRevision: 'workspace-r1',
  sourceRevision: null,
  graphRevision: null,
  representationRevision: null,
  toolRefs: ['atlas-tools/find_source_refs'],
  registryRevision: null,
  inputChecksum: null,
  outputChecksum: null,
  filesObserved: [],
  filesEdited: [],
  commandsExecuted: [],
  validationReceipts: [],
  status: 'PARTIAL',
  writesPerformed: false,
  completionChecksum: null,
};

describe('AgentWorkReceipt -> outcome_ledger adapter', () => {
  it('preserves receipt identity and nullable revisions in metadata', () => {
    const mapped = mapAgentWorkReceiptToOutcomeLedgerV1(receipt);
    expect(mapped.outcomeType).toBe('agent_work_receipt');
    expect(mapped.taskId).toBeNull();
    expect(mapped.traceId).toBeNull();
    expect(mapped.metadata).toMatchObject({
      receiptId: 'receipt-1',
      runId: 'run-1',
      workspaceRevision: 'workspace-r1',
      sourceRevision: null,
      graphRevision: null,
      writesPerformed: false,
    });
  });

  it('accepts only a real UUID for the existing task_id column', () => {
    const mapped = mapAgentWorkReceiptToOutcomeLedgerV1({
      ...receipt,
      taskId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(mapped.taskId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
});
