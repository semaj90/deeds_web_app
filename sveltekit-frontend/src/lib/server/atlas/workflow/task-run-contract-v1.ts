import { z } from 'zod';

export const ATLAS_BOARD_STATES = [
  'triage',
  'todo',
  'ready',
  'running',
  'blocked',
  'done'
] as const;

export const atlasBoardStateSchema = z.enum(ATLAS_BOARD_STATES);
export type AtlasBoardState = z.infer<typeof atlasBoardStateSchema>;

export const ATLAS_RUN_STATES = [
  'claimed',
  'running',
  'succeeded',
  'failed',
  'abandoned',
  'reclaimed',
  'timed_out'
] as const;

export const atlasRunStateSchema = z.enum(ATLAS_RUN_STATES);
export type AtlasRunState = z.infer<typeof atlasRunStateSchema>;

export const atlasTaskSchema = z.object({
  schema: z.literal('atlas.task.v1'),
  taskId: z.string().min(1),
  workflowId: z.string().min(1),
  dagNodeId: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string().default(''),
  state: atlasBoardStateSchema,
  priority: z.enum(['critical', 'high', 'normal', 'low', 'background']).default('normal'),
  dependsOnTaskIds: z.array(z.string().min(1)).default([]),
  blockedReason: z.string().min(1).optional(),
  assignee: z.string().min(1).optional(),
  currentRunId: z.string().min(1).optional(),
  workflowRevision: z.number().int().positive(),
  taskRevision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((value, ctx) => {
  if (value.state === 'blocked' && !value.blockedReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blockedReason'],
      message: 'blocked tasks require blockedReason'
    });
  }
  if (value.state === 'running' && !value.currentRunId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currentRunId'],
      message: 'running tasks require currentRunId'
    });
  }
});

export type AtlasTaskV1 = z.infer<typeof atlasTaskSchema>;

export const atlasRunSchema = z.object({
  schema: z.literal('atlas.task-run.v1'),
  runId: z.string().min(1),
  taskId: z.string().min(1),
  workflowId: z.string().min(1),
  attempt: z.number().int().positive(),
  state: atlasRunStateSchema,
  executorId: z.string().min(1).optional(),
  transport: z.enum(['local', 'grpc', 'rabbitmq', 'acp', 'a2a']).optional(),
  claimedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  heartbeatAt: z.string().datetime().optional(),
  leaseExpiresAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  exitCode: z.number().int().optional(),
  failureCode: z.string().min(1).optional(),
  failureDetail: z.string().min(1).optional(),
  producerRevision: z.string().min(1)
}).superRefine((value, ctx) => {
  const terminal = ['succeeded', 'failed', 'abandoned', 'reclaimed', 'timed_out'].includes(value.state);
  if (terminal && !value.finishedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['finishedAt'],
      message: 'terminal runs require finishedAt'
    });
  }
  if (value.state === 'failed' && !value.failureCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['failureCode'],
      message: 'failed runs require failureCode'
    });
  }
});

export type AtlasTaskRunV1 = z.infer<typeof atlasRunSchema>;

export interface AtlasDependencyStateV1 {
  taskId: string;
  state: AtlasBoardState;
}

export interface AtlasReadinessDecisionV1 {
  state: Extract<AtlasBoardState, 'todo' | 'ready' | 'blocked' | 'done' | 'running' | 'triage'>;
  unresolvedDependencyIds: string[];
  blockedDependencyIds: string[];
  reason: string;
}

/**
 * Derives dispatcher readiness from dependency truth. UI drag/drop must not
 * bypass this decision unless it emits an explicit governed override event.
 */
export function deriveAtlasTaskReadiness(
  task: Pick<AtlasTaskV1, 'state' | 'dependsOnTaskIds' | 'blockedReason'>,
  dependencies: readonly AtlasDependencyStateV1[]
): AtlasReadinessDecisionV1 {
  if (task.state === 'done') {
    return { state: 'done', unresolvedDependencyIds: [], blockedDependencyIds: [], reason: 'task is terminal' };
  }
  if (task.state === 'running') {
    return { state: 'running', unresolvedDependencyIds: [], blockedDependencyIds: [], reason: 'task has an active run' };
  }
  if (task.state === 'triage') {
    return { state: 'triage', unresolvedDependencyIds: [], blockedDependencyIds: [], reason: 'task has not been accepted for execution' };
  }
  if (task.blockedReason && task.state === 'blocked') {
    return { state: 'blocked', unresolvedDependencyIds: [], blockedDependencyIds: [], reason: task.blockedReason };
  }

  const byId = new Map(dependencies.map((dependency) => [dependency.taskId, dependency.state]));
  const unresolvedDependencyIds: string[] = [];
  const blockedDependencyIds: string[] = [];

  for (const dependencyId of task.dependsOnTaskIds) {
    const state = byId.get(dependencyId);
    if (state === 'blocked') blockedDependencyIds.push(dependencyId);
    if (state !== 'done') unresolvedDependencyIds.push(dependencyId);
  }

  if (blockedDependencyIds.length > 0) {
    return {
      state: 'blocked',
      unresolvedDependencyIds,
      blockedDependencyIds,
      reason: 'one or more dependencies are blocked'
    };
  }

  if (unresolvedDependencyIds.length > 0) {
    return {
      state: 'todo',
      unresolvedDependencyIds,
      blockedDependencyIds,
      reason: 'waiting for dependencies'
    };
  }

  return {
    state: 'ready',
    unresolvedDependencyIds: [],
    blockedDependencyIds: [],
    reason: 'all dependencies are complete'
  };
}

export interface AtlasRunLivenessDecisionV1 {
  stale: boolean;
  reclaimable: boolean;
  heartbeatAgeMs: number | null;
  leaseAgeMs: number;
  reason: string;
}

/**
 * Liveness is worker telemetry, not logical task status. A stale/reclaimed run
 * may return its task to READY without treating absence as proof that the
 * underlying task itself failed.
 */
export function evaluateAtlasRunLiveness(
  run: Pick<AtlasTaskRunV1, 'state' | 'heartbeatAt' | 'leaseExpiresAt' | 'finishedAt'>,
  now = new Date()
): AtlasRunLivenessDecisionV1 {
  const terminal = ['succeeded', 'failed', 'abandoned', 'reclaimed', 'timed_out'].includes(run.state);
  const leaseExpiryMs = Date.parse(run.leaseExpiresAt);
  const nowMs = now.getTime();
  const heartbeatMs = run.heartbeatAt ? Date.parse(run.heartbeatAt) : null;
  const heartbeatAgeMs = heartbeatMs === null ? null : Math.max(0, nowMs - heartbeatMs);
  const leaseAgeMs = nowMs - leaseExpiryMs;

  if (terminal || run.finishedAt) {
    return { stale: false, reclaimable: false, heartbeatAgeMs, leaseAgeMs, reason: 'run is terminal' };
  }

  if (nowMs <= leaseExpiryMs) {
    return { stale: false, reclaimable: false, heartbeatAgeMs, leaseAgeMs, reason: 'lease is active' };
  }

  return {
    stale: true,
    reclaimable: true,
    heartbeatAgeMs,
    leaseAgeMs,
    reason: heartbeatAgeMs === null ? 'lease expired without heartbeat' : 'lease expired after last heartbeat'
  };
}

export interface WorkerExitAssessmentV1 {
  protocolViolation: boolean;
  reason: string;
}

/** Workers must make the run terminal before exiting successfully. */
export function assessWorkerExit(
  runState: AtlasRunState,
  exitCode: number | null
): WorkerExitAssessmentV1 {
  const terminal = ['succeeded', 'failed', 'abandoned', 'reclaimed', 'timed_out'].includes(runState);
  if (exitCode === 0 && !terminal) {
    return {
      protocolViolation: true,
      reason: `worker exited successfully while run remained ${runState}`
    };
  }
  return { protocolViolation: false, reason: terminal ? 'run is terminal' : 'worker exit was not successful' };
}
