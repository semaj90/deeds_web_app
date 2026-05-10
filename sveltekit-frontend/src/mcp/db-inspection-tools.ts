/**
 * db-inspection-tools.ts — read-only Drizzle/Postgres inspection MCP tools.
 *
 * Spec: docs/architecture/drizzle-inspection-mcp.md
 *
 * Hard rules (every tool here MUST satisfy):
 *   - No write verbs in any tool's input schema. No INSERT, UPDATE, DELETE,
 *     CREATE, ALTER, DROP, TRUNCATE, GRANT, COPY ... FROM.
 *   - No raw SQL accepted from the model. (db.explain_read_query is planned
 *     and will be EXPLAIN-sandboxed, but it's not in this first cut.)
 *   - All queries pulled from information_schema / pg_class / pg_indexes —
 *     never from arbitrary user-controlled SQL.
 *   - Outputs scrubbed of forbidden columns by default (password,
 *     session_token, api_key, secret, private_key, webhook_secret).
 *   - statement_timeout = 2s on every query.
 *
 * Tool catalogue (this commit):
 *   - db.schema_overview  — list tables with row estimates + jsonb/vector flags
 *   - db.table_inspect    — columns + indexes + foreign keys for one table
 *
 * Future tools (per drizzle-inspection-mcp.md): db.indexes, db.relation_map,
 * db.migration_status, db.find_jsonb_keys, db.drift_check, db.explain_read_query,
 * db.table_sample (gated behind MCP_DB_SAMPLE_ENABLED env).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const STATEMENT_TIMEOUT_MS = 2000;

const FORBIDDEN_COLUMN_PATTERNS = [
  /password/i, /session_token/i, /refresh_token/i, /api_key/i,
  /^secret$/i, /private_key/i, /webhook_secret/i, /_token$/i,
  /^cookie$/i, /evidence_blob/i, /binary_payload/i,
];

function isForbiddenColumn(name: string): boolean {
  return FORBIDDEN_COLUMN_PATTERNS.some(p => p.test(name));
}

async function withTimeout<T>(pool: any, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    return await fn.call({ client });
  } finally {
    client.release();
  }
}

async function tableNotes(pool: any, tableName: string): Promise<string[]> {
  const notes: string[] = [];
  if (tableName === 'embedded_summaries') {
    notes.push('manifold4 is 4d topology metadata (real[]), not a 768d embedding');
  }
  if (tableName === 'context_timeline') {
    notes.push('append-only audit table; never UPDATE/DELETE rows');
  }
  if (tableName === 'agent_context_files') {
    notes.push('content_hash is sha256 of normalised body — re-runs are idempotent');
  }
  return notes;
}

export function registerDbInspectionTools(server: McpServer, pool: any) {

  // == db.schema_overview =====================================================
  // Lists every table in the public schema with row estimate + structural flags.
  // Pulls from pg_class.reltuples (cheap, approximate — accurate enough to
  // distinguish "5K rows" from "50M rows").
  server.registerTool(
    'db.schema_overview',
    {
      description: 'Lists every table in the public schema with row estimate + structural flags.',
      inputSchema: z.object({
        include_row_estimates: z.boolean().default(true)
          .describe('Include pg_class.reltuples row estimates (default true).'),
        schema: z.string().default('public')
          .describe('Postgres schema to enumerate (default "public").'),
      })
    },
    async ({ include_row_estimates, schema }) => {
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

        // Tables + structural flags + row estimate in one shot.
        const sql = `
          SELECT
            t.table_name AS name,
            t.table_schema AS schema,
            (SELECT COUNT(*) FROM information_schema.columns c
             WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS columns,
            (SELECT COUNT(*) FROM pg_indexes i
             WHERE i.schemaname = t.table_schema AND i.tablename = t.table_name) AS indexes,
            ${include_row_estimates
              ? `COALESCE((SELECT c.reltuples::bigint
                          FROM pg_class c
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = t.table_schema AND c.relname = t.table_name), 0) AS row_estimate,`
              : `NULL::bigint AS row_estimate,`}
            EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
                AND c.data_type = 'jsonb'
            ) AS has_jsonb,
            EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
                AND c.udt_name = 'vector'
            ) AS has_vector
          FROM information_schema.tables t
          WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
          ORDER BY t.table_name`;

        const { rows } = await client.query(sql, [schema]);

        const tables = await Promise.all(rows.map(async (r: any) => ({
          name: r.name,
          schema: r.schema,
          columns: Number(r.columns),
          indexes: Number(r.indexes),
          row_estimate: r.row_estimate === null ? null : Number(r.row_estimate),
          has_jsonb: r.has_jsonb === true,
          has_vector: r.has_vector === true,
          notes: await tableNotes(pool, r.name),
        })));

        const summary = {
          tables: tables.length,
          with_jsonb: tables.filter(t => t.has_jsonb).length,
          with_vector: tables.filter(t => t.has_vector).length,
        };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ schema, tables, summary }, null, 2),
          }],
        };
      } finally {
        client.release();
      }
    }
  );

  // == db.table_inspect =======================================================
  // Returns columns + indexes + foreign keys for one table. No row data.
  // Forbidden columns are still listed (the operator needs to know they exist)
  // but their default values are scrubbed.
  server.registerTool(
    'db.table_inspect',
    {
      description: 'Returns columns + indexes + foreign keys for one table. No row data.',
      inputSchema: z.object({
        table: z.string().min(1).max(64)
          .describe('Table name to inspect (validated against pg_class — invalid names return error, never SQL injection).'),
        schema: z.string().default('public')
          .describe('Postgres schema (default "public").'),
        include_columns: z.boolean().default(true)
          .describe('Include column list (default true).'),
        include_indexes: z.boolean().default(true)
          .describe('Include index list (default true).'),
        include_foreign_keys: z.boolean().default(true)
          .describe('Include foreign-key references (default true).'),
      })
    },
    async ({ table, schema, include_columns, include_indexes, include_foreign_keys }) => {
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

        // 1. Validate table exists. If it doesn't, return an error rather than
        //    threading the user-supplied name through subsequent queries.
        const exists = await client.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
          [schema, table]
        );
        if (exists.rows.length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'table_not_found', table, schema,
            }, null, 2) }],
            isError: true,
          };
        }

        const result: Record<string, unknown> = { table, schema };

        if (include_columns) {
          const { rows } = await client.query(
            `SELECT column_name AS name, data_type AS type, udt_name AS udt,
                    is_nullable = 'YES' AS nullable, column_default AS default
             FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position`,
            [schema, table]
          );
          result.columns = rows.map((r: any) => ({
            name: r.name,
            type: r.udt === 'vector' ? 'vector' : r.type,
            nullable: r.nullable,
            default: isForbiddenColumn(r.name) ? '[scrubbed]' : r.default,
            forbidden: isForbiddenColumn(r.name) || undefined,
          }));
        }

        if (include_indexes) {
          // pg_indexes gives us indexdef strings — parse out method + columns + uniqueness.
          const { rows } = await client.query(
            `SELECT indexname AS name, indexdef AS def
             FROM pg_indexes
             WHERE schemaname = $1 AND tablename = $2
             ORDER BY indexname`,
            [schema, table]
          );
          result.indexes = rows.map((r: any) => {
            const def: string = r.def;
            const unique = /CREATE UNIQUE INDEX/i.test(def);
            const methodMatch = def.match(/USING\s+(\w+)/i);
            const colsMatch = def.match(/\(([^)]+)\)/);
            return {
              name: r.name,
              unique,
              method: methodMatch?.[1]?.toLowerCase() ?? 'btree',
              columns: colsMatch?.[1]?.split(',').map(s => s.trim()) ?? [],
              definition: def,
            };
          });
        }

        if (include_foreign_keys) {
          const { rows } = await client.query(
            `SELECT
               tc.constraint_name AS name,
               kcu.column_name    AS column,
               ccu.table_schema   AS ref_schema,
               ccu.table_name     AS ref_table,
               ccu.column_name    AS ref_column
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema    = kcu.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON tc.constraint_name = ccu.constraint_name
              AND tc.table_schema    = ccu.table_schema
             WHERE tc.constraint_type = 'FOREIGN KEY'
               AND tc.table_schema    = $1
               AND tc.table_name      = $2
             ORDER BY tc.constraint_name, kcu.ordinal_position`,
            [schema, table]
          );
          result.foreign_keys = rows.map((r: any) => ({
            name: r.name,
            column: r.column,
            references: { schema: r.ref_schema, table: r.ref_table, column: r.ref_column },
          }));
        }

        result.notes = await tableNotes(pool, table);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } finally {
        client.release();
      }
    }
  );
}
