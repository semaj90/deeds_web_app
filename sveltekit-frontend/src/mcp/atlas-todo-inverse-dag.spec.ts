import { describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  buildTodoInverseDagQuery,
  isMissingTableError,
  registerAtlasTodoInverseDagTool,
} from './atlas-todo-inverse-dag.js';

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

function register(queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  const calls: string[] = [];
  let handler: Handler | undefined;
  let toolName = '';
  const server = {
    registerTool: (name: string, _config: unknown, fn: Handler) => {
      toolName = name;
      handler = fn;
    },
  } as unknown as McpServer;
  const pool = {
    connect: async () => ({
      query: async (sql: string, params?: unknown[]) => {
        calls.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        return queryImpl(sql, params);
      },
      release: () => {},
    }),
  };
  registerAtlasTodoInverseDagTool(server, pool as never);
  return { toolName, handler: handler as Handler, calls };
}

const parse = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0].text);

describe('buildTodoInverseDagQuery', () => {
  it('looks up the input set for a recommendation key', () => {
    const q = buildTodoInverseDagQuery({ recommendation_key: ' rec:1 ' });
    expect(q).toMatchObject({ ok: true, mode: 'inputs', limit: 50, params: ['rec:1', 51] });
    expect(q.ok && q.sql).toContain('WHERE recommendation_key = $1');
  });

  it('looks up recommendations for an input pair', () => {
    const q = buildTodoInverseDagQuery({ input_kind: 'packet', input_ref: 'packet:abc', limit: 5 });
    expect(q).toMatchObject({ ok: true, mode: 'recommendations', limit: 5, params: ['packet', 'packet:abc', 6] });
  });

  it('requires exactly one lookup form', () => {
    expect(buildTodoInverseDagQuery({})).toMatchObject({ ok: false });
    expect(buildTodoInverseDagQuery({ recommendation_key: 'a', input_kind: 'packet', input_ref: 'b' })).toMatchObject({ ok: false });
    expect(buildTodoInverseDagQuery({ input_kind: 'packet' })).toMatchObject({ ok: false, error: 'INPUT_KIND_AND_INPUT_REF_BOTH_REQUIRED' });
  });

  it('rejects an unknown input kind and clamps the limit', () => {
    expect(buildTodoInverseDagQuery({ input_kind: 'bogus', input_ref: 'x' })).toMatchObject({ ok: false });
    expect(buildTodoInverseDagQuery({ recommendation_key: 'a', limit: 99999 })).toMatchObject({ limit: 200 });
    expect(buildTodoInverseDagQuery({ recommendation_key: 'a', limit: -3 })).toMatchObject({ limit: 1 });
  });

  it('never interpolates caller text into the SQL', () => {
    const q = buildTodoInverseDagQuery({ recommendation_key: "x'; DROP TABLE atlas_todo_inverse_dag_v1;--" });
    expect(q.ok && q.sql).not.toContain('DROP');
  });
});

describe('atlas.todo_inverse_dag tool', () => {
  it('registers under the atlas namespace', () => {
    expect(register(async () => ({ rows: [] })).toolName).toBe('atlas.todo_inverse_dag');
  });

  it('runs read-only, reports truncation and writes nothing', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ edge_id: String(i) }));
    const { handler, calls } = register(async (sql) => ({ rows: sql.startsWith('SELECT edge_id') ? rows : [] }));
    const out = parse(await handler({ recommendation_key: 'rec:1', limit: 2 }));
    expect(out).toMatchObject({ ok: true, mode: 'inputs', count: 2, truncated: true, writesPerformed: false });
    expect(calls[0]).toBe('BEGIN READ ONLY');
    expect(calls.at(-1)).toBe('ROLLBACK');
  });

  it('returns an empty, same-shape result when the table is missing', async () => {
    const { handler } = register(async (sql) => {
      if (sql.startsWith('SELECT edge_id')) throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      return { rows: [] };
    });
    const out = parse(await handler({ input_kind: 'feature', input_ref: 'f1' }));
    expect(out).toMatchObject({ ok: true, count: 0, rows: [], tableMissing: true, writesPerformed: false });
  });

  it('flags an invalid request as an error without touching the database', async () => {
    const { handler, calls } = register(async () => ({ rows: [] }));
    const res = await handler({});
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('detects the undefined-table SQLSTATE only', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ code: '42501' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
