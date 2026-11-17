import { consumeFromQueue } from '$lib/server/rabbitmq.js';
import {
  verifyErrorAgentRepairRequestV1,
  type ErrorAgentRepairRequestV1,
} from './repair-request.js';
import { ERROR_AGENT_REPAIR_QUEUE } from './repair-dispatch.js';
import { runWorkflowLoopLangGraph } from './workflow-loop-langgraph.js';
import { runAllowlistedSmokeProfile, type OpenSpecTaskSelection } from './openspec-controller.js';

export interface RepairWorkerExecutionResultV1 {
  ok: boolean;
  proofRefs: string[];
  reason?: string;
}

export type RepairWorkerExecutorV1 = (
  request: ErrorAgentRepairRequestV1,
) => Promise<RepairWorkerExecutionResultV1>;

export type RepairWorkerConsumerV1 = typeof consumeFromQueue;

export interface RepairWorkerStartOptionsV1 {
  enabled: boolean;
  execute: RepairWorkerExecutorV1;
  consume?: RepairWorkerConsumerV1;
  onMessageSettled?: (
    status: 'ACK' | 'NACK',
    request: ErrorAgentRepairRequestV1 | null,
  ) => void | Promise<void>;
}

export type RepairWorkerStartStatus = 'STARTED' | 'NOT_STARTED' | 'REJECTED';

export interface RepairWorkerStartResultV1 {
  schema: 'atlas.error-agent-repair-worker.v1';
  status: RepairWorkerStartStatus;
  queue: typeof ERROR_AGENT_REPAIR_QUEUE;
  reason: string;
  canonicalWritesAllowed: false;
  promotionAuthorized: false;
}

export const MAX_REPAIR_WORKER_TURNS_V1 = 3;

export function evaluateRepairWorkerVerifierGateV1(
  request: ErrorAgentRepairRequestV1,
): { allowed: boolean; reason: string } {
  if (!request.workflowInput) {
    return { allowed: false, reason: 'WORKFLOW_INPUT_MISSING' };
  }
  const { turn, verifierTier, verifierCmd } = request.workflowInput;
  if (turn !== undefined && (!Number.isInteger(turn) || turn < 1 || turn > MAX_REPAIR_WORKER_TURNS_V1)) {
    return { allowed: false, reason: 'AGENTIC_TURN_CAP_EXCEEDED' };
  }
  if (verifierTier === 'T2_DIAGNOSE_ONLY') {
    return { allowed: false, reason: 'DIAGNOSE_ONLY_NO_PATCH' };
  }
  if (verifierTier === 'T1_SPEC_FILE_ON_DISK') {
    return { allowed: false, reason: 'BLOCKED_MISSING_T0_VERIFIER' };
  }
  if (verifierTier === 'T0_RUNNABLE_VERIFIER' && (!verifierCmd || !verifierCmd.trim())) {
    return { allowed: false, reason: 'BLOCKED_MISSING_T0_VERIFIER' };
  }
  return { allowed: true, reason: 'VERIFIER_GATE_PASSED' };
}

/** Execute one immutable request without enabling mutation or promotion. */
export async function executeErrorAgentRepairRequestV1(
  request: ErrorAgentRepairRequestV1,
): Promise<RepairWorkerExecutionResultV1> {
  const gate = evaluateRepairWorkerVerifierGateV1(request);
  if (!gate.allowed) {
    return { ok: false, proofRefs: [], reason: gate.reason };
  }

  const selection: OpenSpecTaskSelection = {
    taskKey: request.taskKey,
    change: request.change,
    text: 'worker-dispatched plan-only request',
    priority: 0,
    controllerState: 'ACTIONABLE',
    blockerKey: request.blockerKey,
    requiredReceipts: request.requiredReceipts,
    smokeProfile: request.smokeProfile as OpenSpecTaskSelection['smokeProfile'],
    completionEnvelopeRevision: request.completionEnvelopeRevision,
    controllerReportChecksum: request.controllerReportChecksum,
    selectionReason: 'WORKER_QUEUE_IMMUTABLE_REQUEST',
    evidenceHash: request.checksum,
    repairRequest: request,
  };

  const workflow = await runWorkflowLoopLangGraph({
    ...request.workflowInput,
    taskKey: request.taskKey,
    completionEnvelopeRevision: request.completionEnvelopeRevision,
    controllerReportChecksum: request.controllerReportChecksum,
    selection,
    planOnly: true,
  }, {
    smoke: async () => {
      const smoke = await runAllowlistedSmokeProfile(request.smokeProfile as OpenSpecTaskSelection['smokeProfile'], {
        change: request.change,
      });
      return {
        passed: smoke.passed,
        command: smoke.command,
        outputSummary: smoke.outputSummary,
      };
    },
    log: async () => undefined,
  });

  return {
    ok: workflow.smoke.passed,
    proofRefs: workflow.gan.proofRefs,
    reason: workflow.smoke.passed ? 'SMOKE_PASSED' : 'SMOKE_FAILED',
  };
}

function startResult(
  status: RepairWorkerStartStatus,
  reason: string,
): RepairWorkerStartResultV1 {
  return {
    schema: 'atlas.error-agent-repair-worker.v1',
    status,
    queue: ERROR_AGENT_REPAIR_QUEUE,
    reason,
    canonicalWritesAllowed: false,
    promotionAuthorized: false,
  };
}

/**
 * Start the worker only from an explicitly managed process. The SvelteKit
 * request path never calls this with enabled=true. Invalid messages are
 * rejected, and a message is acknowledged only after the injected executor
 * returns success.
 */
export async function startErrorAgentRepairWorker(
  options: RepairWorkerStartOptionsV1,
): Promise<RepairWorkerStartResultV1> {
  if (!options.enabled) {
    return startResult('NOT_STARTED', 'WORKER_DISABLED');
  }
  if (typeof options.execute !== 'function') {
    return startResult('REJECTED', 'WORKER_EXECUTOR_REQUIRED');
  }

  const consume = options.consume ?? consumeFromQueue;
  await consume(ERROR_AGENT_REPAIR_QUEUE, async (payload, ack, nack) => {
    if (!verifyErrorAgentRepairRequestV1(payload as ErrorAgentRepairRequestV1)) {
      nack();
      await notifySettled(options.onMessageSettled, 'NACK', null);
      return;
    }

    let settledStatus: 'ACK' | 'NACK';
    try {
      const execution = await options.execute(payload as ErrorAgentRepairRequestV1);
      if (execution.ok) {
        ack();
        settledStatus = 'ACK';
      } else {
        nack();
        settledStatus = 'NACK';
      }
    } catch {
      nack();
      settledStatus = 'NACK';
    }
    await notifySettled(options.onMessageSettled, settledStatus, payload as ErrorAgentRepairRequestV1);
  });

  return startResult('STARTED', 'WORKER_CONSUMER_REGISTERED');
}

async function notifySettled(
  callback: RepairWorkerStartOptionsV1['onMessageSettled'],
  status: 'ACK' | 'NACK',
  request: ErrorAgentRepairRequestV1 | null,
): Promise<void> {
  try {
    await callback?.(status, request);
  } catch (error) {
    console.error('[ErrorAgentRepairWorker] settlement observer failed:', error);
  }
}
