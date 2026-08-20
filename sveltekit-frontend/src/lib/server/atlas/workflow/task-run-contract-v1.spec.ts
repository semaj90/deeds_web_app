import { describe, expect, it } from 'vitest';
import {
  assessWorkerExit,
  atlasRunSchema,
  atlasTaskSchema,
  deriveAtlasTaskReadiness,
  evaluateAtlasRunLiveness
} from './task-run-contract-v1.js';

const now = '2026-08-18T19:00:00.000Z';

const baseTask = {
  schema: 'atlas.task.v1' as const,
  taskId: 'task-child',
  workflowId: 'wf-1',
  title: 'Materialize evidence',
  body: '',
  state: 'todo' as const,
  priority: 'normal' as const,
  dependsOnTaskIds: ['task-a', 'task-b'],
  workflowRevision: 7,
  taskRevision: 3,
  createdAt: now,
  updatedAt: now
};

describe('AtlasTaskV1 readiness', () => {
  it('becomes ready only when all dependencies are done', () => {
    const task = atlasTaskSchema.parse(baseTask);
    const decision = deriveAtlasTaskReadiness(task, [
      { taskId: 'task-a', state: 'done' },
      { taskId: 'task-b', state: 'done' }
    ]);

    expect(decision.state).toBe('ready');
    expect(decision.unresolvedDependencyIds).toEqual([]);
  });

  it('stays todo while a dependency is unresolved', () => {
    const task = atlasTaskSchema.parse(baseTask);
    const decision = deriveAtlasTaskReadiness(task, [
      { taskId: 'task-a', state: 'done' },
      { taskId: 'task-b', state: 'running' }
    ]);

    expect(decision.state).toBe('todo');
    expect(decision.unresolvedDependencyIds).toEqual(['task-b']);
  });

  it('projects blocked when a dependency is blocked', () => {
    const task = atlasTaskSchema.parse(baseTask);
    const decision = deriveAtlasTaskReadiness(task, [
      { taskId: 'task-a', state: 'blocked' },
      { taskId: 'task-b', state: 'done' }
    ]);

    expect(decision.state).toBe('blocked');
    expect(decision.blockedDependencyIds).toEqual(['task-a']);
  });

  it('requires an explicit reason for directly blocked tasks', () => {
    expect(() => atlasTaskSchema.parse({ ...baseTask, state: 'blocked' })).toThrow();
  });

  it('requires a current run for running tasks', () => {
    expect(() => atlasTaskSchema.parse({ ...baseTask, state: 'running' })).toThrow();
  });
});

describe('AtlasTaskRunV1 liveness', () => {
  const baseRun = {
    schema: 'atlas.task-run.v1' as const,
    runId: 'run-1',
    taskId: 'task-child',
    workflowId: 'wf-1',
    attempt: 1,
    state: 'running' as const,
    executorId: 'worker-ast-1',
    transport: 'local' as const,
    claimedAt: '2026-08-18T18:00:00.000Z',
    startedAt: '2026-08-18T18:00:01.000Z',
    heartbeatAt: '2026-08-18T18:50:00.000Z',
    leaseExpiresAt: '2026-08-18T18:55:00.000Z',
    producerRevision: 'atlas-workflow-v1'
  };

  it('marks an expired non-terminal lease reclaimable without declaring task failure', () => {
    const run = atlasRunSchema.parse(baseRun);
    const decision = evaluateAtlasRunLiveness(run, new Date(now));

    expect(decision.stale).toBe(true);
    expect(decision.reclaimable).toBe(true);
  });

  it('does not reclaim an active lease', () => {
    const run = atlasRunSchema.parse({
      ...baseRun,
      leaseExpiresAt: '2026-08-18T19:05:00.000Z'
    });
    const decision = evaluateAtlasRunLiveness(run, new Date(now));

    expect(decision.stale).toBe(false);
    expect(decision.reclaimable).toBe(false);
  });

  it('requires terminal runs to carry finishedAt', () => {
    expect(() => atlasRunSchema.parse({ ...baseRun, state: 'succeeded' })).toThrow();
  });

  it('flags successful worker exit without a terminal run transition', () => {
    expect(assessWorkerExit('running', 0).protocolViolation).toBe(true);
    expect(assessWorkerExit('succeeded', 0).protocolViolation).toBe(false);
  });
});
