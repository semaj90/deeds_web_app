import { describe, expect, it } from 'vitest';
import { readKanbanDagSnapshotV1 } from './kanban-dag-snapshot.js';

const featureId = 'openspec:parent-atlas-agentic-file-compiler';

function fakePool(responses: unknown[]) {
  const calls: Array<{ query: string; values?: unknown[] }> = [];
  const client = {
    async query(query: string, values?: unknown[]) {
      calls.push({ query, values });
      if (/^(BEGIN|ROLLBACK|SELECT set_config)/i.test(query.trim())) return { rows: [] };
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response ?? { rows: [] };
    },
    release() {},
  };
  return { calls, connect: async () => client } as unknown as {
    calls: Array<{ query: string; values?: unknown[] }>;
    connect: () => Promise<typeof client>;
  };
}

function taskRows() {
  return {
    rows: [
      { task_id: 'task-a', feature_label: 'Parent task', lane: 'done', status: 'completed', priority: 1, source_refs: ['openspec/tasks.md'] },
      { task_id: 'task-b', feature_label: 'Child task', lane: 'todo', status: 'pending', priority: 2, source_refs: ['src/task-b.ts'] },
    ],
  };
}

describe('read-only Kanban DAG snapshot', () => {
  it('reads a bounded cohort and same-cohort edges inside one rolled-back read-only snapshot', async () => {
    const pool = fakePool([
      { rows: [{ snapshot_at: new Date('2026-11-02T00:00:00.000Z') }] },
      taskRows(),
      { rows: [{ parent_task_id: 'task-a', child_task_id: 'task-b', parent_feature_id: featureId }] },
      { rows: [] },
    ]);
    const result = await readKanbanDagSnapshotV1(pool, { featureId, limit: 8 });
    expect(result.status).toBe('READY');
    expect(result.tasks).toHaveLength(2);
    expect(result.dependencies).toEqual([{ parentTaskId: 'task-a', childTaskId: 'task-b' }]);
    expect(result.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.writesPerformed).toBe(false);
    expect(pool.calls[0].query).toContain('READ ONLY');
    expect(pool.calls.at(-1)?.query).toBe('ROLLBACK');
    expect(pool.calls.some((call) => /INSERT|UPDATE|DELETE|ALTER|DROP/i.test(call.query))).toBe(false);
  });

  it('keeps the content snapshot hash stable when only observation time changes', async () => {
    const readAt = (timestamp: string) => fakePool([
      { rows: [{ snapshot_at: new Date(timestamp) }] },
      taskRows(),
      { rows: [{ parent_task_id: 'task-a', child_task_id: 'task-b', parent_feature_id: featureId }] },
      { rows: [] },
    ]);
    const first = await readKanbanDagSnapshotV1(readAt('2026-11-02T00:00:00.000Z'), { featureId, limit: 8 });
    const second = await readKanbanDagSnapshotV1(readAt('2026-11-02T00:01:00.000Z'), { featureId, limit: 8 });
    expect(first.snapshotAt).not.toBe(second.snapshotAt);
    expect(first.snapshotHash).toBe(second.snapshotHash);
  });

  it('blocks rather than ranking a truncated cohort', async () => {
    const pool = fakePool([
      { rows: [{ snapshot_at: new Date('2026-11-02T00:00:00.000Z') }] },
      { rows: Array.from({ length: 3 }, (_, index) => ({ task_id: `task-${index}` })) },
      { rows: [] },
    ]);
    const result = await readKanbanDagSnapshotV1(pool, { featureId, limit: 2 });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasonCode).toBe('COHORT_LIMIT_EXCEEDED');
    expect(pool.calls.at(-1)?.query).toBe('ROLLBACK');
  });

  it('blocks external prerequisite edges instead of pretending the cohort is complete', async () => {
    const pool = fakePool([
      { rows: [{ snapshot_at: new Date('2026-11-02T00:00:00.000Z') }] },
      { rows: [taskRows().rows[1]] },
      { rows: [{ parent_task_id: 'outside-task', child_task_id: 'task-b', parent_feature_id: 'openspec:other-change' }] },
      { rows: [] },
    ]);
    const result = await readKanbanDagSnapshotV1(pool, { featureId });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasonCode).toBe('EXTERNAL_OR_UNRESOLVED_PREREQUISITE');
  });

  it('distinguishes missing Kanban schema from an empty cohort', async () => {
    const missing = Object.assign(new Error('relation missing'), { code: '42P01' });
    const pool = fakePool([{ rows: [{ snapshot_at: new Date() }] }, missing, { rows: [] }]);
    const result = await readKanbanDagSnapshotV1(pool, { featureId });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasonCode).toBe('KANBAN_SCHEMA_UNAVAILABLE');
  });
});
