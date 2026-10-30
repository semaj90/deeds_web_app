import { z } from 'zod';
import type { Pool } from 'pg';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const TODO_INVERSE_DAG_INPUT_KINDS = [
  'openspec_task',
  'feature',
  'packet',
  'receipt',
  'kanban_task',
  'recommendation_index_row',
  'source_file',
] as const;

export type TodoInverseDagMode = 'inputs' | 'recommendations';

export type TodoInverseDagQuery =
  | { ok: true; mode: TodoInverseDagMode; sql: string; params: unknown[]; limit: number }
  | { ok: false; error: string };

const COLUMNS =
  'edge_id::text AS edge_id, recommendation_key, input_kind, input_ref, input_source_ref, ' +
  'input_revision, role, ordinal, weight, snapshot_id, producer, producer_revision, canonical, created_at';

/**
 * Exactly one lookup form is accepted:
 *   - recommendation_key                -> the input set behind that recommendation ("inputs")
 *   - input_kind + input_ref            -> the recommendations that input contributed to ("recommendations")
 * Everything is parameterized; the limit is clamped; ordering is deterministic.
 */
export function buildTodoInverseDagQuery(input: {
  recommendation_key?: string;
  input_kind?: string;
  input_ref?: string;
  limit?: number;
}): TodoInverseDagQuery {
  const key = input.recommendation_key?.trim() ?? '';
  const kind = input.input_kind?.trim() ?? '';
  const ref = input.input_ref?.trim() ?? '';
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 200);

  const byKey = key.length > 0;
  const byInput = kind.length > 0 || ref.length > 0;
  if (byKey === byInput) {
    return { ok: false, error: 'PROVIDE_EXACTLY_ONE: recommendation_key, or input_kind with input_ref' };
  }

  if (byKey) {
    if (key.length > 300) return { ok: false, error: 'RECOMMENDATION_KEY_TOO_LONG' };
    return {
      ok: true,
      mode: 'inputs',
      limit,
      sql: `SELECT ${COLUMNS} FROM atlas_todo_inverse_dag_v1 WHERE recommendation_key = $1 ORDER BY ordinal, edge_id LIMIT $2`,
      params: [key, limit + 1],
    };
  }

  if (!kind || !ref) return { ok: false, error: 'INPUT_KIND_AND_INPUT_REF_BOTH_REQUIRED' };
  if (!(TODO_INVERSE_DAG_INPUT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: `UNKNOWN_INPUT_KIND: ${kind}` };
  }
  if (ref.length > 500) return { ok: false, error: 'INPUT_REF_TOO_LONG' };
  return {
    ok: true,
    mode: 'recommendations',
    limit,
    sql: `SELECT ${COLUMNS} FROM atlas_todo_inverse_dag_v1 WHERE input_kind = $1 AND input_ref = $2 ORDER BY recommendation_key, edge_id LIMIT $3`,
    params: [kind, ref, limit + 1],
  };
}

/** SQLSTATE 42P01 = undefined_table. The registry may not exist on an older database. */
export function isMissingTableError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

function text(payload: Record<string, unknown>, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], ...(isError ? { isError: true } : {}) };
}

export function registerAtlasTodoInverseDagTool(server: McpServer, pool: Pick<Pool, 'connect'>): void {
  server.registerTool(
    'atlas.todo_inverse_dag',
    {
      description:
        'Read-only lookup in the derived inverse-DAG registry (atlas_todo_inverse_dag_v1): given a recommendation_key, ' +
        'returns the input set that produced it; given input_kind + input_ref, returns the recommendations that input ' +
        'contributed to. Rows are non-canonical evidence (canonical=false); they never create identity or approval. ' +
        'Writes nothing. Returns an empty result when the registry has no rows.',
      inputSchema: z
        .object({
          recommendation_key: z.string().trim().min(1).max(300).optional(),
          input_kind: z.enum(TODO_INVERSE_DAG_INPUT_KINDS).optional(),
          input_ref: z.string().trim().min(1).max(500).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .strict(),
    },
    async (args) => {
      const query = buildTodoInverseDagQuery(args);
      if ('error' in query) return text({ ok: false, error: query.error, writesPerformed: false }, true);

      const client = await pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
        await client.query("SELECT set_config('statement_timeout', $1, true)", ['15000ms']);
        const result = await client.query(query.sql, query.params);
        await client.query('ROLLBACK');
        const truncated = result.rows.length > query.limit;
        const rows = truncated ? result.rows.slice(0, query.limit) : result.rows;
        return text({ ok: true, mode: query.mode, count: rows.length, truncated, rows, writesPerformed: false });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (isMissingTableError(err)) {
          return text({ ok: true, mode: query.mode, count: 0, truncated: false, rows: [], tableMissing: true, writesPerformed: false });
        }
        return text({ ok: false, error: (err as Error).message, writesPerformed: false }, true);
      } finally {
        client.release();
      }
    },
  );
}
