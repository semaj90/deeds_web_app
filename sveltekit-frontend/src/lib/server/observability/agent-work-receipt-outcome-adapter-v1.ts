import type { AgentWorkReceiptV1 } from './agent-work-receipt-v1.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OutcomeLedgerReceiptInsertV1 {
  outcomeType: 'agent_work_receipt';
  taskId: string | null;
  traceId: string | null;
  toolCallId: string | null;
  score: number | null;
  reward: number | null;
  feedback: string | null;
  metadata: Record<string, unknown>;
}

function nullableUuid(value: string | null): string | null {
  return value !== null && UUID_RE.test(value) ? value : null;
}

/**
 * Pure compatibility mapping for the currently-live outcome_ledger schema.
 * It deliberately does not treat runId as traceId or coerce non-UUID IDs.
 * Persistence/acknowledgement belongs to the future receipt owner.
 */
export function mapAgentWorkReceiptToOutcomeLedgerV1(
  receipt: AgentWorkReceiptV1,
): OutcomeLedgerReceiptInsertV1 {
  return {
    outcomeType: 'agent_work_receipt',
    taskId: nullableUuid(receipt.taskId),
    traceId: null,
    toolCallId: null,
    score: null,
    reward: null,
    feedback: null,
    metadata: {
      schema: receipt.schema,
      receiptId: receipt.receiptId,
      runId: receipt.runId,
      openspecChange: receipt.openspecChange,
      openspecTaskIds: receipt.openspecTaskIds,
      agentId: receipt.agentId,
      modelId: receipt.modelId,
      modelRevision: receipt.modelRevision,
      startedAt: receipt.startedAt,
      completedAt: receipt.completedAt,
      elapsedMs: receipt.elapsedMs,
      inputTokens: receipt.inputTokens,
      outputTokens: receipt.outputTokens,
      cachedTokens: receipt.cachedTokens,
      estimatedCostUsd: receipt.estimatedCostUsd,
      workspaceRevision: receipt.workspaceRevision,
      sourceRevision: receipt.sourceRevision,
      graphRevision: receipt.graphRevision,
      representationRevision: receipt.representationRevision,
      toolRefs: receipt.toolRefs,
      registryRevision: receipt.registryRevision,
      inputChecksum: receipt.inputChecksum,
      outputChecksum: receipt.outputChecksum,
      filesObserved: receipt.filesObserved,
      filesEdited: receipt.filesEdited,
      commandsExecuted: receipt.commandsExecuted,
      validationReceipts: receipt.validationReceipts,
      status: receipt.status,
      writesPerformed: receipt.writesPerformed,
      completionChecksum: receipt.completionChecksum,
    },
  };
}
