import { describe, expect, it, vi } from 'vitest';
import { registerDbInspectionTools } from './db-inspection-tools.js';

describe('database inspection MCP tools', () => {
  it('registers strictly shaped READ_ONLY tools and enforces read-only PostgreSQL transactions', async () => {
    const calls: Array<{ statement: string; parameters?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (statement: string, parameters?: unknown[]) => {
        calls.push({ statement, parameters });
        return { rows: statement.includes('SELECT 1 FROM information_schema.tables') ? [{ exists: 1 }] : [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const registrations = new Map<string, { config: any; handler: (input: unknown) => Promise<any> }>();
    const server = {
      registerTool: (name: string, config: any, handler: (input: unknown) => Promise<any>) => {
        registrations.set(name, { config, handler });
      },
    };
    const modes: string[] = [];
    const dispatcher = {
      wrap: (handler: (input: unknown) => Promise<unknown>, _name: string, _session: string, mode: string) => {
        modes.push(mode);
        return handler;
      },
    };

    registerDbInspectionTools(server as any, pool as any, dispatcher as any);

    expect(modes).toEqual(['READ_ONLY', 'READ_ONLY']);
    const overview = registrations.get('db.schema_overview')!;
    const inspect = registrations.get('db.table_inspect')!;
    expect(() => overview.config.inputSchema.parse({ schema: 'public', query: 'DROP TABLE evidence_vectors' })).toThrow();
    expect(() => inspect.config.inputSchema.parse({ table: 'evidence_vectors', sql: 'INSERT INTO x VALUES (1)' })).toThrow();

    await overview.handler({ schema: 'public', include_row_estimates: false });
    await inspect.handler({ table: 'evidence_vectors', schema: 'public', include_columns: true, include_indexes: true, include_foreign_keys: true });

    const transactionStarts = calls.filter(({ statement }) => statement === 'BEGIN TRANSACTION READ ONLY');
    const transactionEnds = calls.filter(({ statement }) => statement === 'COMMIT');
    expect(transactionStarts).toHaveLength(2);
    expect(transactionEnds).toHaveLength(2);
    expect(calls.some(({ statement }) => statement === 'SET LOCAL statement_timeout = 2000')).toBe(true);
    expect(calls.some(({ statement }) => /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|COPY)\b/i.test(statement))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(2);
  });
});
