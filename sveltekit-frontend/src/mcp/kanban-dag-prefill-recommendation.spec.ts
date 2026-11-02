import { describe, expect, it } from 'vitest';
import {
  KanbanDagPrefillRecommendationInputV1Schema,
  recommendKanbanDagPrefillV1,
  registerKanbanDagPrefillRecommendationTool,
} from './kanban-dag-prefill-recommendation.js';

function poolFor(tasks: unknown[], dependencies: unknown[] = []) {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('transaction_timestamp')) return { rows: [{ snapshot_at: '2026-11-02T12:00:00.000Z' }] };
      if (sql.includes('FROM kanban_tasks')) return { rows: tasks };
      if (sql.includes('FROM kanban_task_dependencies')) return { rows: dependencies };
      return { rows: [] };
    },
    release: () => undefined,
  };
  return {
    statements,
    pool: { connect: async () => client } as never,
  };
}

const task = (taskId: string, lane = 'todo', status = 'pending') => ({
  task_id: taskId,
  feature_label: `Task ${taskId}`,
  lane,
  status,
  priority: 50,
  source_refs: [],
});

describe('Kanban DAG prefill recommendation MCP tool', () => {
  it('validates a strict bounded feature cohort', () => {
    expect(KanbanDagPrefillRecommendationInputV1Schema.safeParse({ featureId: 'openspec:sample' }).success).toBe(true);
    expect(KanbanDagPrefillRecommendationInputV1Schema.safeParse({ featureId: 'sample', extra: true }).success).toBe(false);
    expect(KanbanDagPrefillRecommendationInputV1Schema.safeParse({
      featureId: 'openspec:sample',
      cohortLimit: 129,
    }).success).toBe(false);
  });

  it('returns proposal-only topological order from a read-only snapshot', async () => {
    const { pool, statements } = poolFor(
      [task('task-b'), task('task-a', 'done', 'completed')],
      [{ parent_task_id: 'task-a', child_task_id: 'task-b', parent_feature_id: 'openspec:sample' }],
    );
    const result = await recommendKanbanDagPrefillV1(pool, { featureId: 'openspec:sample' });

    expect(result).toMatchObject({
      status: 'PROPOSED',
      algorithm: 'KAHN_STABLE_TOPOLOGICAL_ORDER',
      readyTaskIds: ['task-b'],
      admission: 'PROPOSAL_ONLY',
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(statements[0]).toContain('READ ONLY');
    expect(statements.at(-1)).toBe('ROLLBACK');
  });

  it('blocks a cohort exceeding the explicit bound', async () => {
    const { pool } = poolFor([task('task-a'), task('task-b')]);
    const result = await recommendKanbanDagPrefillV1(pool, {
      featureId: 'openspec:sample',
      cohortLimit: 1,
    });

    expect(result).toMatchObject({ status: 'BLOCKED', reasonCode: 'COHORT_LIMIT_EXCEEDED', writesPerformed: false });
  });

  it('registers a named MCP tool and does not imply execution authority', async () => {
    let registration: { name: string; config: { description: string }; handler: (input: unknown) => Promise<unknown> } | undefined;
    const server = {
      registerTool: (name: string, config: { description: string }, handler: (input: unknown) => Promise<unknown>) => {
        registration = { name, config, handler };
      },
    } as never;
    const { pool } = poolFor([task('task-a')]);
    registerKanbanDagPrefillRecommendationTool(server, pool);

    expect(registration?.name).toBe('atlas.kanban_dag_prefill_recommendation');
    expect(registration?.config.description).toContain('never dispatches');
    const response = await registration!.handler({ featureId: 'openspec:sample' });
    expect(JSON.stringify(response)).toContain('PROPOSAL_ONLY');
  });
});
