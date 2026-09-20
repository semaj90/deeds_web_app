import {
  agentWorkReceiptChecksumV1,
  type AgentWorkReceiptV1,
} from '$lib/server/observability/agent-work-receipt-v1.js';
import type { ErrorAgentExecutionReceiptV1 } from './execution-receipt.js';
import type { ErrorAgentRepairRequestV1 } from './repair-request.js';

export interface ErrorAgentReceiptPersistenceBindingV1 {
  schema: 'atlas.error-agent-receipt-persistence-binding.v1';
  owner: 'AgentWorkReceiptV1';
  store: 'recordAgentWorkReceiptV1';
  receipt: AgentWorkReceiptV1;
  persistenceAuthorized: false;
  writesPerformed: false;
}

/**
 * Pure bridge to the existing agent-work receipt owner. This does not call
 * recordAgentWorkReceiptV1 and therefore cannot create a database write.
 */
export function mapErrorAgentExecutionReceiptToAgentWorkReceiptV1(
  request: ErrorAgentRepairRequestV1,
  execution: ErrorAgentExecutionReceiptV1,
  options: { startedAt: string; completedAt?: string; elapsedMs?: number },
): ErrorAgentReceiptPersistenceBindingV1 {
  const base: AgentWorkReceiptV1 = {
    schema: 'atlas.agent-work-receipt.v1',
    receiptId: execution.requestId,
    runId: execution.requestId,
    taskId: null,
    openspecChange: request.change,
    openspecTaskIds: [request.taskKey],
    agentId: 'atlas.error-agent.worker',
    modelId: null,
    modelRevision: null,
    startedAt: options.startedAt,
    completedAt: options.completedAt ?? null,
    elapsedMs: options.elapsedMs ?? null,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    estimatedCostUsd: null,
    workspaceRevision: request.workflowInput?.workspaceRevision ?? null,
    sourceRevision: null,
    graphRevision: null,
    representationRevision: null,
    toolRefs: execution.proofRefs,
    registryRevision: request.controllerReportChecksum,
    inputChecksum: request.checksum,
    outputChecksum: execution.checksum,
    filesObserved: [],
    filesEdited: [],
    commandsExecuted: [],
    validationReceipts: execution.proofRefs,
    status: execution.smokePassed && execution.workerStatus === 'ACK' ? 'SUCCEEDED' : 'FAILED',
    writesPerformed: false,
    completionChecksum: null,
  };

  const receipt = {
    ...base,
    completionChecksum: agentWorkReceiptChecksumV1(base),
  };

  return {
    schema: 'atlas.error-agent-receipt-persistence-binding.v1',
    owner: 'AgentWorkReceiptV1',
    store: 'recordAgentWorkReceiptV1',
    receipt,
    persistenceAuthorized: false,
    writesPerformed: false,
  };
}

