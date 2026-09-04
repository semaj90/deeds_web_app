import { describe, expect, it } from 'vitest';
import {
  AgentWorkReceiptV1Schema,
  agentWorkReceiptChecksumV1,
  validateAgentWorkReceiptV1,
} from './agent-work-receipt-v1.js';

const base = {
  schema: 'atlas.agent-work-receipt.v1' as const,
  receiptId: 'receipt-1', runId: 'run-1', taskId: null, openspecChange: null,
  openspecTaskIds: [], agentId: null, modelId: null, modelRevision: null,
  startedAt: '2026-09-03T12:00:00.000Z', completedAt: null, elapsedMs: null,
  inputTokens: null, outputTokens: null, cachedTokens: null, estimatedCostUsd: null,
  workspaceRevision: null, sourceRevision: null, graphRevision: null,
  representationRevision: null, toolRefs: [], registryRevision: null,
  inputChecksum: null, outputChecksum: null, filesObserved: [], filesEdited: [],
  commandsExecuted: [], validationReceipts: [], status: 'RUNNING' as const,
  writesPerformed: false, completionChecksum: null,
};

describe('AgentWorkReceiptV1', () => {
  it('allows honest nulls for unavailable enrichment', () => {
    expect(AgentWorkReceiptV1Schema.parse(base).workspaceRevision).toBeNull();
  });

  it('deterministically computes and validates a completion checksum', () => {
    const receipt = { ...base, status: 'SUCCEEDED' as const };
    const complete = { ...receipt, completionChecksum: agentWorkReceiptChecksumV1(receipt) };
    expect(validateAgentWorkReceiptV1(complete)).toEqual(complete);
  });

  it('rejects a false completion checksum', () => {
    expect(() => validateAgentWorkReceiptV1({ ...base, completionChecksum: 'sha256:' + '0'.repeat(64) })).toThrow('AGENT_WORK_RECEIPT_COMPLETION_CHECKSUM_MISMATCH');
  });

  it('keeps checksum stable when runtime observations change', () => {
    const first = agentWorkReceiptChecksumV1(base);
    const replay = agentWorkReceiptChecksumV1({
      ...base,
      startedAt: '2026-09-03T13:00:00.000Z',
      completedAt: '2026-09-03T13:00:02.000Z',
      elapsedMs: 2000,
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.01,
    });
    expect(replay).toBe(first);
  });
});
