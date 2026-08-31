import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  adaptiveDagPlanV1Schema,
  type AdaptiveDagActionV1,
  type AdaptiveDagPlanV1,
  type DagActionKind,
} from '@deeds/parent-atlas/core/adaptive-dag-plan-v1';
import {
  runBoundedExecutionPlan,
  type ExecutableTask,
  type ExecutorLimits,
  type ResourceClass,
} from '../policy/bounded-executor.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);
const revision = z.string().min(1);

export type Oak2026ExecutionModeV1 = 'SHADOW' | 'PRODUCTION';

export interface Oak2026GroundedEvidenceV1 {
  evidenceKind: string;
  evidenceRef: string;
  evidenceChecksum?: string;
}

export interface Oak2026DagHandlerResultV1 {
  value: unknown;
  groundedEvidence: Oak2026GroundedEvidenceV1[];
  writesPerformed?: boolean;
}

export interface Oak2026DagActionHandlerV1 {
  actionKind: DagActionKind;
  resourceClass: ResourceClass;
  outputContract: string | '*';
  execute: (input: {
    action: AdaptiveDagActionV1;
    plan: AdaptiveDagPlanV1;
    context: Oak2026DagExecutionContextV1;
  }) => Promise<Oak2026DagHandlerResultV1>;
}

export interface Oak2026DagExecutionContextV1 {
  kernelRevision: string;
  bindingChecksum: string;
  programRevision: string;
  executionMode: Oak2026ExecutionModeV1;
  authorizationRef?: string | null;
}

const groundedEvidenceSchema = z.object({
  evidenceKind: id,
  evidenceRef: id,
  evidenceChecksum: checksum.optional(),
}).strict();

const actionReceiptSchema = z.object({
  actionId: id,
  actionKind: z.string().min(1),
  inputChecksum: checksum,
  status: z.enum(['SUCCEEDED', 'FAILED', 'SKIPPED_DEPENDENCY']),
  outputChecksum: checksum.nullable(),
  groundedEvidence: z.array(groundedEvidenceSchema),
  elapsedMs: z.number().int().nonnegative(),
  error: z.string().min(1).nullable(),
}).strict();

export const oak2026DagExecutionReceiptV1Schema = z.object({
  schema: z.literal('atlas.oak2026-dag-execution-receipt.v1'),
  executionMode: z.enum(['SHADOW', 'PRODUCTION']),
  kernelRevision: revision,
  bindingChecksum: checksum,
  programRevision: revision,
  planId: id,
  planChecksum: checksum,
  plannerRevision: revision,
  classificationRevision: revision,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  actions: z.array(actionReceiptSchema),
  writesPerformed: z.boolean(),
  canonicalAuthority: z.literal(false),
  deterministicExecutionChecksum: checksum,
  receiptChecksum: checksum,
}).strict();

export type Oak2026DagExecutionReceiptV1 = z.infer<typeof oak2026DagExecutionReceiptV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function buildHandlerMap(handlers: readonly Oak2026DagActionHandlerV1[]): Map<DagActionKind, Oak2026DagActionHandlerV1> {
  const map = new Map<DagActionKind, Oak2026DagActionHandlerV1>();
  for (const handler of handlers) {
    if (map.has(handler.actionKind)) throw new Error(`OAK_EXECUTOR_DUPLICATE_HANDLER:${handler.actionKind}`);
    map.set(handler.actionKind, handler);
  }
  return map;
}

function assertExecutionAdmission(input: {
  plan: AdaptiveDagPlanV1;
  manifestState: string;
  context: Oak2026DagExecutionContextV1;
}): void {
  if (input.plan.dagRevision !== input.context.kernelRevision) {
    throw new Error('OAK_EXECUTION_KERNEL_REVISION_MISMATCH');
  }

  if (input.context.executionMode === 'SHADOW') {
    if (!['DRAFT', 'FROZEN'].includes(input.manifestState)) {
      throw new Error(`OAK_SHADOW_MANIFEST_STATE_REJECTED:${input.manifestState}`);
    }
    for (const action of input.plan.actions) {
      if (action.mutationPolicy === 'MUTATES_WITH_RECEIPT') {
        throw new Error(`OAK_SHADOW_MUTATION_FORBIDDEN:${action.actionId}`);
      }
    }
    return;
  }

  if (input.manifestState !== 'FROZEN') {
    throw new Error(`OAK_PRODUCTION_REQUIRES_FROZEN_MANIFEST:${input.manifestState}`);
  }
  if (!input.context.authorizationRef) throw new Error('OAK_PRODUCTION_AUTHORIZATION_REQUIRED');
}

/**
 * OAK-EXEC-01/02/03/04.
 *
 * This is an adapter, not a new runtime scheduler. It lowers the already
 * checksummed AdaptiveDagPlanV1 into ExecutableTask[] and delegates dependency
 * ordering, cycle detection, max parallel calls and resource concurrency to
 * runBoundedExecutionPlan(). Handler registration is explicit and fail-closed.
 */
export async function executeOak2026AdaptiveDagV1(input: {
  plan: z.input<typeof adaptiveDagPlanV1Schema>;
  manifestState: string;
  context: Oak2026DagExecutionContextV1;
  handlers: readonly Oak2026DagActionHandlerV1[];
  limits?: ExecutorLimits;
}): Promise<Oak2026DagExecutionReceiptV1> {
  const plan = adaptiveDagPlanV1Schema.parse(input.plan);
  assertExecutionAdmission({ plan, manifestState: input.manifestState, context: input.context });
  const handlers = buildHandlerMap(input.handlers);

  const actionRuntime = new Map<string, {
    startedAtMs: number;
    completedAtMs: number;
    result?: Oak2026DagHandlerResultV1;
  }>();

  const tasks: ExecutableTask<Oak2026DagHandlerResultV1>[] = plan.actions.map((action, index) => {
    const handler = handlers.get(action.actionKind);
    if (!handler) throw new Error(`OAK_EXECUTOR_HANDLER_NOT_REGISTERED:${action.actionKind}`);
    if (handler.outputContract !== '*' && handler.outputContract !== action.outputContract) {
      throw new Error(`OAK_EXECUTOR_OUTPUT_CONTRACT_MISMATCH:${action.actionId}`);
    }

    return {
      id: action.actionId,
      priority: plan.actions.length - index,
      dependencies: action.parentActionIds,
      resourceClass: handler.resourceClass,
      run: async () => {
        const startedAtMs = Date.now();
        actionRuntime.set(action.actionId, { startedAtMs, completedAtMs: startedAtMs });
        const result = await handler.execute({ action, plan, context: input.context });
        const completedAtMs = Date.now();
        actionRuntime.set(action.actionId, { startedAtMs, completedAtMs, result });
        if (input.context.executionMode === 'SHADOW' && result.writesPerformed === true) {
          throw new Error(`OAK_SHADOW_HANDLER_REPORTED_WRITE:${action.actionId}`);
        }
        return result;
      },
    };
  });

  const startedAt = new Date().toISOString();
  const genericReceipts = await runBoundedExecutionPlan(tasks, input.limits);
  const completedAt = new Date().toISOString();

  const actions = plan.actions.map((action, index) => {
    const generic = genericReceipts[index]!;
    const runtime = actionRuntime.get(action.actionId);
    const result = runtime?.result;
    const elapsedMs = runtime ? Math.max(0, runtime.completedAtMs - runtime.startedAtMs) : 0;
    const groundedEvidence = result?.groundedEvidence ?? [];
    if (generic.status === 'SUCCEEDED' && groundedEvidence.length === 0) {
      throw new Error(`OAK_EXECUTION_SUCCEEDED_WITHOUT_GROUNDED_EVIDENCE:${action.actionId}`);
    }
    return actionReceiptSchema.parse({
      actionId: action.actionId,
      actionKind: action.actionKind,
      inputChecksum: action.inputChecksum,
      status: generic.status,
      outputChecksum: generic.status === 'SUCCEEDED' ? sha256(result?.value ?? null) : null,
      groundedEvidence,
      elapsedMs,
      error: generic.status === 'FAILED' ? generic.error ?? 'OAK_EXECUTION_FAILED' : null,
    });
  });

  const writesPerformed = plan.actions.some((action) => {
    const runtime = actionRuntime.get(action.actionId);
    return runtime?.result?.writesPerformed === true;
  });

  const deterministicBody = {
    executionMode: input.context.executionMode,
    kernelRevision: input.context.kernelRevision,
    bindingChecksum: input.context.bindingChecksum,
    programRevision: input.context.programRevision,
    planId: plan.planId,
    planChecksum: plan.planChecksum,
    plannerRevision: plan.plannerRevision,
    classificationRevision: plan.classificationRevision,
    actions: actions.map(({ elapsedMs: _elapsedMs, ...action }) => action),
    writesPerformed,
    canonicalAuthority: false as const,
  };
  const deterministicExecutionChecksum = sha256(deterministicBody);
  const body = {
    schema: 'atlas.oak2026-dag-execution-receipt.v1' as const,
    ...deterministicBody,
    startedAt,
    completedAt,
    actions,
    deterministicExecutionChecksum,
  };

  return oak2026DagExecutionReceiptV1Schema.parse({
    ...body,
    receiptChecksum: sha256(body),
  });
}
