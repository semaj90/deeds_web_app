import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const dbState = vi.hoisted(() => {
  const selectResults: Row[][] = [];
  const updateResults: Row[][] = [];
  const insertResults: Row[][] = [];
  const executeResults: Row[][] = [];

  const makeQuery = (rows: Row[]) => {
    const query: any = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(rows)),
    };
    query.then = (resolve: (value: Row[]) => void) => Promise.resolve(rows).then(resolve);
    return query;
  };

  const db = {
    select: vi.fn(() => makeQuery(selectResults.shift() ?? [])),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(updateResults.shift() ?? [])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(insertResults.shift() ?? [])),
      })),
    })),
    execute: vi.fn(() => Promise.resolve({ rows: executeResults.shift() ?? [] })),
    transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db as typeof db)),
  };

  return { db, selectResults, updateResults, insertResults, executeResults };
});

vi.mock('$lib/server/db/client.js', () => ({
  db: dbState.db,
}));

import {
  claimKanbanTask,
  createChildKanbanTask,
  completeKanbanTask,
  formatKanbanTaskSummary,
  heartbeatKanbanTask,
  listKanbanTasks,
  listKanbanTaskComments,
  listKanbanTaskAttempts,
  listKanbanTaskEvents,
  listKanbanTaskDependencies,
  recordKanbanTaskAttempt,
  promoteReadyChildrenForParent,
  reclaimStaleKanbanTask,
  retryKanbanTask,
  showKanbanTask,
} from './kanban-task-board.js';

describe('kanban-task-board', () => {
  beforeEach(() => {
    dbState.db.select.mockClear();
    dbState.db.update.mockClear();
    dbState.db.insert.mockClear();
    dbState.db.execute.mockClear();
    dbState.db.transaction.mockClear();
    dbState.selectResults.length = 0;
    dbState.updateResults.length = 0;
    dbState.insertResults.length = 0;
    dbState.executeResults.length = 0;
  });

  it('lists tasks from the mocked board', async () => {
    dbState.selectResults.push(
      [
        {
          task_id: 'task-a',
          feature_id: 'feature-a',
          feature_label: 'Feature A',
          source_refs: ['src/a.ts'],
          lane: 'todo',
          status: 'pending',
          validation_command: null,
          created_at: '2026-08-13T00:00:00.000Z',
          updated_at: '2026-08-13T00:00:00.000Z',
        },
      ],
      [{ total: 1 }],
    );

    const result = await listKanbanTasks({ limit: 10 });

    expect(result.total).toBe(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.taskId).toBe('task-a');
    expect(formatKanbanTaskSummary(result.tasks[0]!)).toContain('Feature A');
  });

  it('supports task lifecycle mutations', async () => {
    dbState.updateResults.push([
      {
        task_id: 'task-b',
        feature_id: 'feature-b',
        feature_label: 'Feature B',
        source_refs: ['src/b.ts'],
        lane: 'in_progress',
        status: 'active',
        validation_command: 'claimed_by:worker-1',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:01:00.000Z',
      },
    ]);
    const claimed = await claimKanbanTask({ taskId: 'task-b', workerId: 'worker-1' });
    expect(claimed.task.lane).toBe('in_progress');
    expect(claimed.task.validationCommand).toContain('claimed_by:worker-1');
    expect(claimed.claimToken).toContain('claim:');
    expect(claimed.runId).toContain('run:');

    dbState.updateResults.push([
      {
        task_id: 'task-b',
        feature_id: 'feature-b',
        feature_label: 'Feature B',
        source_refs: ['src/b.ts'],
        lane: 'done',
        status: 'completed',
        validation_command: 'completed_by:worker-1',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:02:00.000Z',
      },
    ]);
    const completed = await completeKanbanTask({ taskId: 'task-b', workerId: 'worker-1' });
    expect(completed.status).toBe('completed');

    dbState.updateResults.push([
      {
        task_id: 'task-b',
        feature_id: 'feature-b',
        feature_label: 'Feature B',
        source_refs: ['src/b.ts'],
        lane: 'todo',
        status: 'pending',
        validation_command: 'retry:transient',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:03:00.000Z',
      },
    ]);
    const retried = await retryKanbanTask({ taskId: 'task-b', reason: 'transient' });
    expect(retried.status).toBe('pending');
  });

  it('records lifecycle events in order and keeps them queryable', async () => {
    dbState.updateResults.push([
      {
        task_id: 'task-event',
        feature_id: 'feature-event',
        feature_label: 'Feature Event',
        source_refs: ['src/event.ts'],
        lane: 'in_progress',
        status: 'active',
        validation_command: 'claimed_by:worker-1',
        claim_token: 'claim-1',
        current_run_id: 'run-1',
        claim_expires_at: '2026-08-13T00:20:00.000Z',
        last_heartbeat_at: '2026-08-13T00:10:00.000Z',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:01:00.000Z',
      },
    ]);
    dbState.updateResults.push([
      {
        task_id: 'task-event',
        feature_id: 'feature-event',
        feature_label: 'Feature Event',
        source_refs: ['src/event.ts'],
        lane: 'done',
        status: 'completed',
        validation_command: 'completed_by:worker-1',
        claim_token: null,
        current_run_id: 'run-1',
        claim_expires_at: null,
        last_heartbeat_at: '2026-08-13T00:10:00.000Z',
        completed_at: '2026-08-13T00:30:00.000Z',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:30:00.000Z',
      },
    ]);
    dbState.updateResults.push([
      {
        task_id: 'task-event',
        feature_id: 'feature-event',
        feature_label: 'Feature Event',
        source_refs: ['src/event.ts'],
        lane: 'todo',
        status: 'pending',
        validation_command: 'retry:manual',
        claim_token: null,
        current_run_id: null,
        claim_expires_at: null,
        last_heartbeat_at: null,
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:40:00.000Z',
      },
    ]);
    dbState.executeResults.push([
      {
        task_id: 'task-event',
        run_id: 'run-1',
        event_type: 'claimed',
        payload: { workerId: 'worker-1' },
        created_at: '2026-08-13T00:10:01.000Z',
      },
      {
        task_id: 'task-event',
        run_id: 'run-1',
        event_type: 'completed',
        payload: { workerId: 'worker-1' },
        created_at: '2026-08-13T00:30:01.000Z',
      },
      {
        task_id: 'task-event',
        run_id: null,
        event_type: 'retried',
        payload: { reason: 'manual' },
        created_at: '2026-08-13T00:40:01.000Z',
      },
    ]);

    await claimKanbanTask({ taskId: 'task-event', workerId: 'worker-1', runId: 'run-1', claimToken: 'claim-1' });
    await completeKanbanTask({ taskId: 'task-event', workerId: 'worker-1', runId: 'run-1' });
    await retryKanbanTask({ taskId: 'task-event', reason: 'manual' });

    const events = await listKanbanTaskEvents({ taskId: 'task-event', limit: 10 });
    expect(events.map((event) => event.eventType)).toEqual(['claimed', 'completed', 'retried']);
    expect(events[0]?.runId).toBe('run-1');
    expect(events[1]?.payload).toMatchObject({ workerId: 'worker-1' });
  });

  it('lists comments and attempts for a task', async () => {
    dbState.selectResults.push([
      {
        id: 1,
        task_id: 'task-notes',
        author: 'worker-1',
        body: 'looks good',
        created_at: '2026-08-13T01:00:00.000Z',
      },
    ]);
    dbState.executeResults.push([
      {
        id: 2,
        task_id: 'task-notes',
        run_id: 'run-2',
        worker: 'worker-1',
        started_at: '2026-08-13T01:00:00.000Z',
        finished_at: '2026-08-13T01:01:00.000Z',
        success: true,
        failure_kind: null,
        execution_receipt_id: 'receipt-2',
      },
    ]);

    const comments = await listKanbanTaskComments({ taskId: 'task-notes' });
    const attempts = await listKanbanTaskAttempts({ taskId: 'task-notes' });

    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe('looks good');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.executionReceiptId).toBe('receipt-2');
  });

  it('records an execution receipt on a Kanban attempt', async () => {
    dbState.insertResults.push([
      {
        id: 7,
        task_id: 'task-attempt',
        run_id: 'run-attempt',
        worker: 'worker-7',
        started_at: '2026-08-13T01:10:00.000Z',
        finished_at: '2026-08-13T01:10:01.000Z',
        success: true,
        failure_kind: null,
        execution_receipt_id: 'receipt-7',
      },
    ]);

    await recordKanbanTaskAttempt({
      taskId: 'task-attempt',
      runId: 'run-attempt',
      worker: 'worker-7',
      success: true,
      executionReceiptId: 'receipt-7',
    });

    expect(dbState.db.insert).toHaveBeenCalled();
  });

  it('claims atomically with one winner and one conflict', async () => {
    dbState.updateResults.push([
      {
        task_id: 'task-atomic',
        feature_id: 'feature-atomic',
        feature_label: 'Feature Atomic',
        source_refs: ['src/atomic.ts'],
        lane: 'in_progress',
        status: 'active',
        validation_command: 'claimed_by:worker-a',
        claim_token: 'claim-a',
        current_run_id: 'run-a',
        claim_expires_at: '2026-08-13T00:20:00.000Z',
        last_heartbeat_at: '2026-08-13T00:10:00.000Z',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:01:00.000Z',
      },
    ]);
    dbState.updateResults.push([]);

    const [winner, loser] = await Promise.allSettled([
      claimKanbanTask({ taskId: 'task-atomic', workerId: 'worker-a' }),
      claimKanbanTask({ taskId: 'task-atomic', workerId: 'worker-b' }),
    ]);

    const fulfilled = [winner, loser].filter((result) => result.status === 'fulfilled');
    const rejected = [winner, loser].filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (fulfilled[0]?.status === 'fulfilled') {
      expect(fulfilled[0].value.task.taskId).toBe('task-atomic');
      expect(fulfilled[0].value.task.status).toBe('active');
    }
    if (rejected[0]?.status === 'rejected') {
      expect(String(rejected[0].reason)).toMatch(/claim conflict|not found/i);
    }
  });

  it('refreshes a running task lease with heartbeat', async () => {
    dbState.updateResults.push([
      {
        task_id: 'task-heartbeat',
        feature_id: 'feature-heartbeat',
        feature_label: 'Feature Heartbeat',
        source_refs: ['src/heartbeat.ts'],
        lane: 'in_progress',
        status: 'active',
        validation_command: 'claimed_by:worker-1',
        claim_token: 'claim-1',
        current_run_id: 'run-1',
        claim_expires_at: '2026-08-13T00:20:00.000Z',
        last_heartbeat_at: '2026-08-13T00:10:00.000Z',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:15:00.000Z',
      },
    ]);

    const result = await heartbeatKanbanTask({
      taskId: 'task-heartbeat',
      claimToken: 'claim-1',
      runId: 'run-1',
    });

    expect(result.task.taskId).toBe('task-heartbeat');
    expect(result.task.status).toBe('active');
    expect(result.heartbeatAt).toMatch(/T/);
    expect(result.claimExpiresAt).toMatch(/T/);
  });

  it('reclaims an expired running task', async () => {
    dbState.updateResults.push([
      {
        task_id: 'task-stale',
        feature_id: 'feature-stale',
        feature_label: 'Feature Stale',
        source_refs: ['src/stale.ts'],
        lane: 'todo',
        status: 'pending',
        validation_command: 'stale_claim_reclaimed',
        claim_token: null,
        current_run_id: null,
        claim_expires_at: null,
        last_heartbeat_at: null,
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:30:00.000Z',
      },
    ]);

    const reclaimed = await reclaimStaleKanbanTask({ taskId: 'task-stale' });
    expect(reclaimed.lane).toBe('todo');
    expect(reclaimed.status).toBe('pending');
    expect(reclaimed.validationCommand).toBe('stale_claim_reclaimed');
  });

  it('creates a child task with parent lineage in source refs', async () => {
    dbState.insertResults.push([
      {
        task_id: 'task-child',
        feature_id: 'feature-child',
        feature_label: 'Child Feature',
        source_refs: ['src/child.ts', 'parent_task:task-parent'],
        lane: 'todo',
        status: 'pending',
        validation_command: 'parent_task:task-parent',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:00:00.000Z',
      },
    ]);

    const child = await createChildKanbanTask({
      parentTaskId: 'task-parent',
      taskId: 'task-child',
      featureId: 'feature-child',
      featureLabel: 'Child Feature',
      sourceRefs: ['src/child.ts'],
    });

    expect(child.taskId).toBe('task-child');
    expect(child.sourceRefs).toContain('parent_task:task-parent');
  });

  it('lists and promotes dependency-linked child tasks when parents are done', async () => {
    dbState.executeResults.push(
      [{
        parent_task_id: 'task-parent-done',
        child_task_id: 'task-child-promote',
        created_at: '2026-08-13T00:00:00.000Z',
      }],
      [{ child_task_id: 'task-child-promote' }],
      [
        {
          task_id: 'task-parent-done',
          feature_id: 'feature-parent',
          feature_label: 'Parent Done',
          source_refs: ['src/parent.ts'],
          lane: 'done',
          status: 'completed',
          validation_command: 'completed_by:worker-1',
          created_at: '2026-08-13T00:00:00.000Z',
          updated_at: '2026-08-13T00:10:00.000Z',
        },
      ],
      [
        {
          task_id: 'task-child-promote',
          feature_id: 'feature-child',
          feature_label: 'Child Promote',
          source_refs: ['src/child.ts'],
          lane: 'todo',
          status: 'pending',
          validation_command: 'promoted_ready_from:task-parent-done',
          created_at: '2026-08-13T00:00:00.000Z',
          updated_at: '2026-08-13T00:20:00.000Z',
        },
      ],
    );
    dbState.updateResults.push([
      {
        task_id: 'task-child-promote',
        feature_id: 'feature-child',
        feature_label: 'Child Promote',
        source_refs: ['src/child.ts', 'parent_task:task-parent-done'],
        lane: 'todo',
        status: 'pending',
        validation_command: 'promoted_ready_from:task-parent-done',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:30:00.000Z',
      },
    ]);
    dbState.insertResults.push([
      {
        task_id: 'task-child-promote',
        feature_id: 'feature-child',
        feature_label: 'Child Promote',
        source_refs: ['src/child.ts', 'parent_task:task-parent-done'],
        lane: 'todo',
        status: 'pending',
        validation_command: 'parent_task:task-parent-done',
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:00:00.000Z',
      },
    ]);

    const child = await createChildKanbanTask({
      parentTaskId: 'task-parent-done',
      taskId: 'task-child-promote',
      featureId: 'feature-child',
      featureLabel: 'Child Promote',
      sourceRefs: ['src/child.ts'],
    });

    const deps = await listKanbanTaskDependencies({ parentTaskId: 'task-parent-done' });
    expect(deps).toHaveLength(1);
    expect(deps[0]?.childTaskId).toBe('task-child-promote');
    expect(child.sourceRefs).toContain('parent_task:task-parent-done');

    const promoted = await promoteReadyChildrenForParent('task-parent-done');
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.taskId).toBe('task-child-promote');
    expect(promoted[0]?.validationCommand).toBe('promoted_ready_from:task-parent-done');
  });

  it('shows a task by id', async () => {
    dbState.selectResults.push([
      {
        task_id: 'task-show',
        feature_id: 'feature-show',
        feature_label: 'Feature Show',
        source_refs: ['src/show.ts'],
        lane: 'todo',
        status: 'pending',
        validation_command: null,
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:00:00.000Z',
      },
    ]);

    const task = await showKanbanTask({ taskId: 'task-show' });
    expect(task?.taskId).toBe('task-show');
  });
});
