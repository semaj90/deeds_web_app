import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';

loadRuntimeEnv({ cwd: process.cwd(), mode: 'development', override: true });

const { closeRabbitMQ } = await import('../../src/lib/server/rabbitmq.js');
const { dispatchPlanOnlyRepairRequest } = await import('../../src/lib/server/ai/error-agent/repair-dispatch.js');
const { buildErrorAgentRepairRequestV1 } = await import('../../src/lib/server/ai/error-agent/repair-request.js');
const { buildErrorAgentExecutionReceiptV1 } = await import('../../src/lib/server/ai/error-agent/execution-receipt.js');
const {
  readOpenSpecControllerReport,
  selectOpenSpecTask,
  reconcileRepairRequestAgainstCurrentController,
} = await import('../../src/lib/server/ai/error-agent/openspec-controller.js');
const {
  executeErrorAgentRepairRequestV1,
  startErrorAgentRepairWorker,
} = await import('../../src/lib/server/ai/error-agent/repair-worker.js');

const controllerBefore = readOpenSpecControllerReport();
const requestId = `repair:live-worker:${Date.now()}`;
const threadId = `thread:live-worker:${Date.now()}`;
let selectionMode: 'REAL_ACTIONABLE_SELECTION' | 'BLOCKED_TRANSPORT_FIXTURE' = 'REAL_ACTIONABLE_SELECTION';
let selected: ReturnType<typeof selectOpenSpecTask> | null = null;
try {
  selected = selectOpenSpecTask(controllerBefore);
} catch (error) {
  const code = String(error instanceof Error ? error.message : error);
  if (!/OPENSPEC_COMPLETION_ENVELOPE_BLOCKED|OPENSPEC_NO_ACTIONABLE_TASK|OPENSPEC_COMPLETION_SCOPE_UNSAFE/.test(code)) throw error;
  selectionMode = 'BLOCKED_TRANSPORT_FIXTURE';
}

const request = selected?.repairRequest
  ? buildErrorAgentRepairRequestV1(selected, {
    requestId,
    workflowInput: {
      query: `run bounded smoke for ${selected.taskKey}`,
      hmmErrorClass: 'route_contract_mismatch',
      threadId,
    },
  })
  : buildErrorAgentRepairRequestV1({
    taskKey: 'fixture:live-worker-transport',
    change: 'parent-atlas-agentic-completion',
    completionEnvelopeRevision: controllerBefore.completionEnvelopes[0].revision,
    controllerReportChecksum: controllerBefore.checksum,
    blockerKey: null,
    requiredReceipts: ['fixture:live-worker'],
    smokeProfile: 'controller-report',
  }, {
    requestId,
    workflowInput: {
      query: 'run one bounded live worker transport smoke',
      hmmErrorClass: 'route_contract_mismatch',
      threadId,
    },
  });

let execution: Awaited<ReturnType<typeof executeErrorAgentRepairRequestV1>> | undefined;
let resolveExecution: (() => void) | undefined;
let settledStatus: 'ACK' | 'NACK' | undefined;
let resolveSettled: (() => void) | undefined;
const executionObserved = new Promise<void>((resolve) => {
  resolveExecution = resolve;
});
const settledObserved = new Promise<void>((resolve) => {
  resolveSettled = resolve;
});

const worker = await startErrorAgentRepairWorker({
  enabled: true,
  execute: async (payload) => {
    execution = await executeErrorAgentRepairRequestV1(payload);
    resolveExecution?.();
    return execution;
  },
  onMessageSettled: async (status) => {
    settledStatus = status;
    resolveSettled?.();
  },
});

const dispatch = await dispatchPlanOnlyRepairRequest(request, {
  enabled: true,
  publisher: {
    publish: async (_queue, payload) => {
      const { publishToQueue } = await import('../../src/lib/server/rabbitmq.js');
      return publishToQueue('atlas.error-agent.repair.v1', payload);
    },
  },
});
if (dispatch.status !== 'DISPATCHED') throw new Error(`LIVE_WORKER_SMOKE_PUBLISH_FAILED:${dispatch.reason}`);

await Promise.race([
  Promise.all([executionObserved, settledObserved]),
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LIVE_WORKER_SMOKE_TIMEOUT')), 60_000)),
]);

const report = {
  schema: 'atlas.error-agent-repair-live-smoke.v1',
  worker,
  dispatch,
  requestChecksum: request.checksum,
  selectionMode,
  selectedTaskKey: selected?.taskKey ?? null,
  execution,
  settledStatus,
  controllerReconciliation: (() => {
    const controllerAfter = readOpenSpecControllerReport();
    return {
      beforeChecksum: controllerBefore.checksum,
      afterChecksum: controllerAfter.checksum,
      status: execution
        ? reconcileRepairRequestAgainstCurrentController(request, controllerAfter, execution.ok)
        : 'REVIEW_REQUIRED',
      writesPerformed: false,
    };
  })(),
  receipt: execution
    ? buildErrorAgentExecutionReceiptV1(
      request,
      dispatch,
      settledStatus ?? 'NOT_SETTLED',
      execution,
      { reconciliationStatus: (() => {
        const controllerAfter = readOpenSpecControllerReport();
        return reconcileRepairRequestAgainstCurrentController(request, controllerAfter, execution.ok);
      })() },
    )
    : null,
  messagesPublished: 1,
  canonicalWritesAllowed: false,
  promotionAuthorized: false,
  writesPerformed: false,
};

console.log(JSON.stringify(report, null, 2));
await closeRabbitMQ();
process.exitCode = execution?.ok ? 0 : 1;
process.exit();
