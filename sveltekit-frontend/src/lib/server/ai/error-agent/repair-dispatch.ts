import { verifyErrorAgentRepairRequestV1, type ErrorAgentRepairRequestV1 } from './repair-request.js';

export const ERROR_AGENT_REPAIR_QUEUE = 'atlas.error-agent.repair.v1' as const;

export type RepairDispatchStatus = 'NOT_DISPATCHED' | 'DISPATCHED' | 'REJECTED';

export interface RepairDispatchResultV1 {
  schema: 'atlas.error-agent-repair-dispatch.v1';
  status: RepairDispatchStatus;
  queue: typeof ERROR_AGENT_REPAIR_QUEUE;
  requestId: string;
  reason: string;
  canonicalWritesAllowed: false;
  promotionAuthorized: false;
}

export interface RepairRequestPublisherV1 {
  publish(queue: typeof ERROR_AGENT_REPAIR_QUEUE, request: ErrorAgentRepairRequestV1): Promise<boolean>;
}

export interface RepairDispatchOptionsV1 {
  enabled?: boolean;
  publisher?: RepairRequestPublisherV1;
}

function result(
  request: ErrorAgentRepairRequestV1,
  status: RepairDispatchStatus,
  reason: string,
): RepairDispatchResultV1 {
  return {
    schema: 'atlas.error-agent-repair-dispatch.v1',
    status,
    queue: ERROR_AGENT_REPAIR_QUEUE,
    requestId: request.requestId,
    reason,
    canonicalWritesAllowed: false,
    promotionAuthorized: false,
  };
}

/**
 * Dispatch is deliberately opt-in. The first tranche only creates an
 * immutable plan and smoke receipt; it must not publish work from a request
 * handler unless a separately admitted worker boundary enables it.
 */
export async function dispatchPlanOnlyRepairRequest(
  request: ErrorAgentRepairRequestV1,
  options: RepairDispatchOptionsV1 = {},
): Promise<RepairDispatchResultV1> {
  if (!verifyErrorAgentRepairRequestV1(request)) {
    return result(request, 'REJECTED', 'INVALID_REPAIR_REQUEST_CHECKSUM');
  }

  if (!options.enabled) {
    return result(request, 'NOT_DISPATCHED', 'PLAN_ONLY_DISPATCH_DISABLED');
  }

  if (!options.publisher) {
    return result(request, 'REJECTED', 'WORKER_PUBLISHER_UNAVAILABLE');
  }

  const published = await options.publisher.publish(ERROR_AGENT_REPAIR_QUEUE, request);
  return published
    ? result(request, 'DISPATCHED', 'WORKER_QUEUE_ACCEPTED_IMMUTABLE_REQUEST')
    : result(request, 'REJECTED', 'WORKER_QUEUE_REJECTED_REQUEST');
}

