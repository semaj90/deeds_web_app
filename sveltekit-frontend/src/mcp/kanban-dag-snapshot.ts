import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const MAX_TASKS = 128;
const MAX_DEPENDENCIES = 512;

export const KanbanDagSnapshotInputV1Schema = z.object({
  featureId: z.string().trim().regex(/^openspec:[a-z0-9][a-z0-9-]*$/),
  limit: z.number().int().min(1).max(MAX_TASKS).optional().default(64),
}).strict();

export type KanbanDagSnapshotInputV1 = z.input<typeof KanbanDagSnapshotInputV1Schema>;

type Queryable = Pick<Pool, 'connect'>;

function blocked(featureId: string, reasonCode: string, details: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.kanban-task-dag-snapshot.v1',
    status: 'BLOCKED',
    featureId,
    reasonCode,
    ...details,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export async function readKanbanDagSnapshotV1(
  pool: Queryable,
  input: KanbanDagSnapshotInputV1,
) {
  const parsed = KanbanDagSnapshotInputV1Schema.parse(input);
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch {
    return blocked(parsed.featureId, 'KANBAN_SNAPSHOT_UNAVAILABLE');
  }
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SELECT set_config('statement_timeout', $1, true)", ['5000ms']);
    const timestampResult = await client.query<{ snapshot_at: Date | string }>(
      'SELECT transaction_timestamp() AS snapshot_at',
    );
    const taskResult = await client.query<{
      task_id: string;
      feature_label: string;
      lane: string;
      status: string;
      priority: number | string;
      source_refs: unknown;
    }>(
      `SELECT task_id, feature_label, lane, status, priority, source_refs
       FROM kanban_tasks
       WHERE feature_id = $1
       ORDER BY task_id
       LIMIT $2`,
      [parsed.featureId, parsed.limit + 1],
    );

    if (taskResult.rows.length > parsed.limit) {
      await client.query('ROLLBACK');
      return blocked(parsed.featureId, 'COHORT_LIMIT_EXCEEDED', {
        limit: parsed.limit,
        observedAtLeast: taskResult.rows.length,
      });
    }
    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        schema: 'atlas.kanban-task-dag-snapshot.v1',
        status: 'EMPTY',
        featureId: parsed.featureId,
        tasks: [],
        dependencies: [],
        canonicalAuthority: false,
        writesPerformed: false,
      };
    }

    const tasks = taskResult.rows.map((row) => ({
      taskId: row.task_id,
      featureLabel: row.feature_label,
      lane: row.lane,
      status: row.status,
      priority: Number(row.priority),
      sourceRefs: row.source_refs,
    }));
    const taskIds = new Set(tasks.map((task) => task.taskId));
    const malformedTask = tasks.some((task) =>
      !task.taskId || typeof task.featureLabel !== 'string' || task.featureLabel.length === 0 ||
      task.featureLabel.length > 500 || !['todo', 'in_progress', 'done'].includes(task.lane) ||
      !['pending', 'active', 'completed', 'failed'].includes(task.status) ||
      !Number.isInteger(task.priority) || task.priority < 0 || task.priority > 100 || !Array.isArray(task.sourceRefs) ||
      task.sourceRefs.some((sourceRef) => typeof sourceRef !== 'string'));
    if (malformedTask || taskIds.size !== tasks.length) {
      await client.query('ROLLBACK');
      return blocked(parsed.featureId, 'KANBAN_ROW_CONTRACT_INVALID');
    }

    const dependencyResult = await client.query<{
      parent_task_id: string;
      child_task_id: string;
      parent_feature_id: string | null;
    }>(
      `SELECT d.parent_task_id, d.child_task_id, parent.feature_id AS parent_feature_id
       FROM kanban_task_dependencies d
       JOIN kanban_tasks child ON child.task_id = d.child_task_id
       LEFT JOIN kanban_tasks parent ON parent.task_id = d.parent_task_id
       WHERE child.feature_id = $1
       ORDER BY d.parent_task_id, d.child_task_id
       LIMIT $2`,
      [parsed.featureId, MAX_DEPENDENCIES + 1],
    );

    if (dependencyResult.rows.length > MAX_DEPENDENCIES) {
      await client.query('ROLLBACK');
      return blocked(parsed.featureId, 'DEPENDENCY_LIMIT_EXCEEDED', {
        limit: MAX_DEPENDENCIES,
        observedAtLeast: dependencyResult.rows.length,
      });
    }
    const externalDependencies = dependencyResult.rows.filter((edge) =>
      !taskIds.has(edge.parent_task_id) || edge.parent_feature_id !== parsed.featureId);
    if (externalDependencies.length > 0) {
      await client.query('ROLLBACK');
      return blocked(parsed.featureId, 'EXTERNAL_OR_UNRESOLVED_PREREQUISITE', {
        externalPrerequisiteCount: externalDependencies.length,
      });
    }

    const dependencies = dependencyResult.rows.map((edge) => ({
      parentTaskId: edge.parent_task_id,
      childTaskId: edge.child_task_id,
    }));
    const snapshotAtValue = timestampResult.rows[0]?.snapshot_at;
    const snapshotAt = snapshotAtValue instanceof Date
      ? snapshotAtValue.toISOString()
      : typeof snapshotAtValue === 'string'
        ? snapshotAtValue
        : null;
    if (!snapshotAt) {
      await client.query('ROLLBACK');
      return blocked(parsed.featureId, 'SNAPSHOT_TIMESTAMP_UNAVAILABLE');
    }

    const snapshotHash = createHash('sha256')
      .update(JSON.stringify({ featureId: parsed.featureId, tasks, dependencies }) ?? '')
      .digest('hex');
    await client.query('ROLLBACK');
    return {
      schema: 'atlas.kanban-task-dag-snapshot.v1',
      status: 'READY',
      featureId: parsed.featureId,
      snapshotAt,
      snapshotHash,
      tasks,
      dependencies,
      sourceAuthority: 'KANBAN_TASKS_POSTGRES_READ_ONLY_SNAPSHOT',
      canonicalAuthority: false,
      writesPerformed: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'UNKNOWN';
    return blocked(parsed.featureId, code === '42P01'
      ? 'KANBAN_SCHEMA_UNAVAILABLE'
      : code === '57014'
        ? 'KANBAN_SNAPSHOT_TIMEOUT'
        : 'KANBAN_SNAPSHOT_UNAVAILABLE');
  } finally {
    client.release();
  }
}

export function registerKanbanDagSnapshotTool(server: McpServer, pool: Queryable): void {
  server.registerTool(
    'atlas.kanban_dag_snapshot',
    {
      description:
        'Read a bounded OpenSpec Kanban cohort and its prerequisite edges from PostgreSQL in a REPEATABLE READ READ ONLY transaction. ' +
        'Returns BLOCKED for truncation, invalid rows, external prerequisites, missing schema, or timeout. It writes no task data and does not authorize execution.',
      inputSchema: KanbanDagSnapshotInputV1Schema,
    },
    async (input) => ({
      content: [{
        type: 'text' as const,
        text: JSON.stringify(await readKanbanDagSnapshotV1(pool, input)),
      }],
    }),
  );
}
