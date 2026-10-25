import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const dbState = vi.hoisted(() => {
  const insertResults: Row[][] = [];
  const insertedPayloads: unknown[] = [];

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((payload: unknown) => {
        insertedPayloads.push(payload);
        return {
          returning: vi.fn(() => Promise.resolve(insertResults.shift() ?? [])),
        };
      }),
    })),
    execute: vi.fn(() => Promise.resolve({ rows: [] })),
    transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db as typeof db)),
  };

  return { db, insertResults, insertedPayloads };
});

vi.mock('$lib/server/db/client.js', () => ({
  db: dbState.db,
}));

import { createKanbanTask } from './kanban-task-board.js';

describe('createKanbanTask revision-bound ticket creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.insertResults.length = 0;
    dbState.insertedPayloads.length = 0;
  });

  it('creates a top-level revision-bound kanban ticket and records a ticket_created event with workspaceRevision', async () => {
    dbState.insertResults.push([
      {
        task_id: 'task-ticket-v1',
        feature_id: 'feat:oaklib-tuple-gate',
        feature_label: 'Verify OAKLIB tuple gate',
        source_refs: ['scripts/atlas/prove_oaklib_ontology_tuple_to_pytorch_loading_v1.py'],
        lane: 'todo',
        status: 'pending',
        validation_command: 'py -3.13 -m pytest python/tests/test_oaklib_ontology_tuple_to_pytorch_loading_v1.py -v',
        created_at: '2026-10-25T04:00:00.000Z',
        updated_at: '2026-10-25T04:00:00.000Z',
      },
    ]);

    const created = await createKanbanTask({
      taskId: 'task-ticket-v1',
      featureId: 'feat:oaklib-tuple-gate',
      featureLabel: 'Verify OAKLIB tuple gate',
      sourceRefs: ['scripts/atlas/prove_oaklib_ontology_tuple_to_pytorch_loading_v1.py'],
      lane: 'todo',
      priority: 75,
      validationCommand: 'py -3.13 -m pytest python/tests/test_oaklib_ontology_tuple_to_pytorch_loading_v1.py -v',
      workspaceRevision: 'sha256:23413763d52c94ecf5e4566edbfbe283505e048aafe7f2b7a417dc55c74492e5',
      graphifyRevision: 'graphify:23413763',
      featureRevision: 'feature:oaklib-v1',
      permissionMode: 'proposal_only',
    });

    expect(created.taskId).toBe('task-ticket-v1');
    expect(created.featureId).toBe('feat:oaklib-tuple-gate');
    expect(created.lane).toBe('todo');
    // 1 insert into kanban_tasks + 1 insert into kanban_task_events
    expect(dbState.db.insert).toHaveBeenCalledTimes(2);
    expect(dbState.insertedPayloads[1]).toMatchObject({
      taskId: 'task-ticket-v1',
      eventType: 'ticket_created',
      payload: expect.objectContaining({
        workspaceRevision: 'sha256:23413763d52c94ecf5e4566edbfbe283505e048aafe7f2b7a417dc55c74492e5',
        graphifyRevision: 'graphify:23413763',
        featureRevision: 'feature:oaklib-v1',
        permissionMode: 'proposal_only',
      }),
    });
  });
});
