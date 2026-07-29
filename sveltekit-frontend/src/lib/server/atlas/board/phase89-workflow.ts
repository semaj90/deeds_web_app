import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getRedis } from '../../redis.js';
import type { DailyGraphifyBoardData } from './daily-graphify-board.js';

export type DailyGraphifyBoardTask = {
  id: string;
  priority: string;
  label: string;
  script?: string;
  gate?: string;
  blockedBy?: string[];
  status?: string;
  origin?: string;
  recommendation_id?: string;
  source_ref?: string | null;
  tree_node_id?: string | null;
  evidence_refs?: string[];
  reason_codes?: string[];
};

export interface Phase89WorkflowPlan {
  workflowId: string;
  taskId: string | null;
  taskLabel: string | null;
  taskPriority: string | null;
  recommendationId: string | null;
  sourceRef: string | null;
  treeNodeId: string | null;
  validationRoutes: string[];
  validationQueueKeys: string[];
  warnings: string[];
  dryRun: boolean;
  steps: Array<{
    action: 'queue:workflow' | 'queue:playwright-check' | 'acp:phase89';
    target: string;
    detail?: string;
  }>;
}

export const Phase89WorkflowRequestSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    dryRun: z.boolean().default(false),
    validationRoute: z.string().min(1).optional(),
  })
  .strict();

function isPhase89Task(task: DailyGraphifyBoardTask): boolean {
  const text = `${task.id} ${task.label} ${task.script ?? ''} ${task.gate ?? ''}`.toLowerCase();
  return (
    text.includes('phase89') ||
    text.includes('graphify') ||
    text.includes('cluster') ||
    text.includes('summary') ||
    text.includes('tag') ||
    text.includes('rank') ||
    text.includes('index')
  );
}

function priorityWeight(priority?: string): number {
  switch ((priority ?? '').toUpperCase()) {
    case 'P0':
    case 'HIGH':
    case 'CRITICAL':
      return 0;
    case 'P1':
    case 'MEDIUM':
      return 1;
    case 'P2':
    case 'LOW':
      return 2;
    default:
      return 3;
  }
}

export function flattenDailyGraphifyBoardTasks(board: DailyGraphifyBoardData): DailyGraphifyBoardTask[] {
  return board.columns.flatMap((column) => column.tasks as DailyGraphifyBoardTask[]);
}

export function selectDailyGraphifyBoardTask(
  board: DailyGraphifyBoardData,
  taskId?: string,
): DailyGraphifyBoardTask | null {
  const tasks = flattenDailyGraphifyBoardTasks(board);
  if (taskId) {
    return tasks.find((task) => task.id === taskId) ?? null;
  }

  const runnable = tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));

  return (
    runnable.find((task) => typeof task.script === 'string' && task.script.length > 0) ??
    runnable.find((task) => task.recommendation_id) ??
    runnable[0] ??
    tasks.find((task) => typeof task.script === 'string' && task.script.length > 0) ??
    tasks[0] ??
    null
  );
}

export function deriveWorkflowValidationRoutes(
  board: DailyGraphifyBoardData,
  task: DailyGraphifyBoardTask | null,
  requestRoute?: string,
): string[] {
  const routes = new Set<string>();
  if (requestRoute) routes.add(requestRoute);
  routes.add('/admin/ai-dashboard');
  if (task && isPhase89Task(task)) routes.add('/admin/phase89');
  if (board.warnings.length > 0) routes.add('/admin/ai-dashboard');
  return Array.from(routes);
}

export function buildPhase89WorkflowPlan(
  board: DailyGraphifyBoardData,
  request: z.input<typeof Phase89WorkflowRequestSchema>,
): Phase89WorkflowPlan {
  const parsedRequest = Phase89WorkflowRequestSchema.parse(request);
  const task = selectDailyGraphifyBoardTask(board, parsedRequest.taskId);
  const workflowId = `phase89-board-workflow:${task?.id ?? 'board'}:${randomUUID()}`;
  const validationRoutes = deriveWorkflowValidationRoutes(board, task, parsedRequest.validationRoute);
  const validationQueueKeys = validationRoutes.map((route) => `playwright-check:${route}`);

  return {
    workflowId,
    taskId: task?.id ?? null,
    taskLabel: task?.label ?? null,
    taskPriority: task?.priority ?? null,
    recommendationId: task?.recommendation_id ?? null,
    sourceRef: task?.source_ref ?? null,
    treeNodeId: task?.tree_node_id ?? null,
    validationRoutes,
    validationQueueKeys,
    warnings: [...board.warnings],
    dryRun: parsedRequest.dryRun,
    steps: [
      {
        action: 'queue:workflow',
        target: workflowId,
        detail: task
          ? `Task ${task.id} (${task.priority}) from ${board.collection}`
          : `No explicit task selected from ${board.collection}`,
      },
      ...validationQueueKeys.map((queueKey, index) => ({
        action: 'queue:playwright-check' as const,
        target: queueKey,
        detail: validationRoutes[index] ? `Validate ${validationRoutes[index]}` : undefined,
      })),
      {
        action: 'acp:phase89',
        target: 'board-coordinator',
        detail: 'Board-driven validation surfaced through ACP and Playwright queues',
      },
    ],
  };
}

export async function recordPhase89WorkflowPlan(
  plan: Phase89WorkflowPlan,
  redisClient = getRedis(),
): Promise<{
  workflowId: string;
  queuedRoutes: string[];
}> {
  const payload = JSON.stringify({
    workflowId: plan.workflowId,
    taskId: plan.taskId,
    taskLabel: plan.taskLabel,
    recommendationId: plan.recommendationId,
    sourceRef: plan.sourceRef,
    treeNodeId: plan.treeNodeId,
    validationRoutes: plan.validationRoutes,
    warnings: plan.warnings,
    dryRun: plan.dryRun,
    queuedAt: new Date().toISOString(),
    source: 'daily-graphify-board',
  });

  await redisClient.set(`phase89:workflow:${plan.workflowId}`, payload, 'EX', 900);

  await Promise.all(
    plan.validationRoutes.map((route) =>
      redisClient.set(
        `playwright-check:${route}`,
        JSON.stringify({
          route,
          requestedAt: new Date().toISOString(),
          status: 'queued',
          workflowId: plan.workflowId,
          taskId: plan.taskId,
          source: 'daily-graphify-board',
        }),
        'EX',
        300,
      ),
    ),
  );

  return {
    workflowId: plan.workflowId,
    queuedRoutes: plan.validationRoutes,
  };
}
