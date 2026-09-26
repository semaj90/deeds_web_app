import { createHash } from 'node:crypto';
import type { ReconciliationStatus } from './openspec-controller.js';
import type { ErrorAgentRepairRequestV1 } from './repair-request.js';
import type { RepairDispatchResultV1 } from './repair-dispatch.js';
import type { RepairWorkerExecutionResultV1 } from './repair-worker.js';

export const ERROR_AGENT_EXECUTION_RECEIPT_SCHEMA = 'atlas.error-agent-execution-receipt.v1' as const;

export interface ErrorAgentExecutionReceiptV1 {
  schema: typeof ERROR_AGENT_EXECUTION_RECEIPT_SCHEMA;
  requestId: string;
  taskKey: string;
  change: string;
  controllerReportChecksum: string;
  dispatchStatus: RepairDispatchResultV1['status'];
  workerStatus: 'ACK' | 'NACK' | 'NOT_SETTLED';
  smokePassed: boolean;
  reconciliationStatus: ReconciliationStatus | 'NOT_RUN';
  proofRefs: string[];
  canonicalAuthority: false;
  canonicalWritesAllowed: false;
  promotionAuthorized: false;
  writesPerformed: false;
  persistence: 'READ_ONLY_NOT_PERSISTED';
  checksum: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex')}`;
}

export function buildErrorAgentExecutionReceiptV1(
  request: ErrorAgentRepairRequestV1,
  dispatch: RepairDispatchResultV1,
  workerStatus: 'ACK' | 'NACK' | 'NOT_SETTLED',
  execution: RepairWorkerExecutionResultV1,
  options: {
    reconciliationStatus?: ReconciliationStatus;
    proofRefs?: string[];
  } = {},
): ErrorAgentExecutionReceiptV1 {
  const unsigned = {
    schema: ERROR_AGENT_EXECUTION_RECEIPT_SCHEMA,
    requestId: request.requestId,
    taskKey: request.taskKey,
    change: request.change,
    controllerReportChecksum: request.controllerReportChecksum,
    dispatchStatus: dispatch.status,
    workerStatus,
    smokePassed: execution.ok,
    reconciliationStatus: options.reconciliationStatus ?? 'NOT_RUN',
    proofRefs: [...new Set([...(execution.proofRefs ?? []), ...(options.proofRefs ?? [])])],
    canonicalAuthority: false as const,
    canonicalWritesAllowed: false as const,
    promotionAuthorized: false as const,
    writesPerformed: false as const,
    persistence: 'READ_ONLY_NOT_PERSISTED' as const,
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

export function verifyErrorAgentExecutionReceiptV1(receipt: ErrorAgentExecutionReceiptV1): boolean {
  if (receipt.schema !== ERROR_AGENT_EXECUTION_RECEIPT_SCHEMA) return false;
  if (receipt.canonicalAuthority || receipt.canonicalWritesAllowed || receipt.promotionAuthorized || receipt.writesPerformed) return false;
  if (receipt.persistence !== 'READ_ONLY_NOT_PERSISTED') return false;
  const { checksum: provided, ...unsigned } = receipt;
  return Boolean(provided) && provided === checksum(unsigned);
}

