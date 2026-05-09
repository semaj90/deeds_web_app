---
name: Drizzle Inspection MCP (read-only)
description: Specification for read-only Drizzle/Postgres inspection tools exposed through TRACE MCP — gives Claude Code a "Drizzle Studio" view without granting write access.
type: project
tags:
  - mcp
  - drizzle
  - postgres
  - read-only
  - safety
  - schema
---

# Drizzle Inspection MCP (read-only)

Goal: let `drizzle-inspector` and other Claude Code subagents see schema
shape, migration state, JSONB envelope keys, indexes, and relationships
**without** ever issuing INSERT/UPDATE/DELETE/DDL or running migrations.

All tools below are registered against `src/mcp/trace-mcp-server.ts`
using the same `pg` pool that other read-side TRACE tools use. None of
them accept user-supplied SQL strings except `db.explain_read_query`,
which is sandboxed.

## Hard rules

- **No write verbs in any tool's schema.** No `INSERT`, `UPDATE`,
  `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`,
  `COPY … FROM`, `pg_terminate_backend`, function/procedure execution,
  or `SET ROLE`.
- **No raw SQL except via `db.explain_read_query`**, which:
  - rejects any statement whose normalized form starts with anything
    other than `SELECT` or `WITH`;
  - rewrites the statement as `EXPLAIN (FORMAT JSON, ANALYZE FALSE) <stmt>`;
  - executes inside a `READ ONLY` transaction with `statement_timeout=2s`.
- **Sample limits are non-negotiable.** `LIMIT ≤ 5`. No `OFFSET`. No
  `ORDER BY` on `created_at` for paginated leaks.
- **Allowed-table allowlist**, not a denylist. Tools that read row
  data check `ALLOWED_INSPECTION_TABLES` from env/config before
  executing.
- **Forbidden columns are scrubbed** before the tool returns:
  `password_hash`, `password`, `session_token`, `refresh_token`,
  `api_key`, `secret`, `private_key`, `webhook_secret`, `cookie`,
  `evidence_blob`, `binary_payload`, anything ending in `_token`.
- **JSONB sample values are truncated** to 200 chars per value, and
  the whole sample row is capped at 4 KB JSON.

## Tool catalogue

### `db.schema_overview`

**Input**

```json
{ "include_row_estimates": true }
```

**Output**

```json
{
  "tables": [
    {
      "name": "embedded_summaries",
      "schema": "public",
      "columns": 18,
      "indexes": 3,
      "row_estimate": 12000,
      "has_jsonb": true,
      "has_vector": false,
      "notes": ["manifold4 is 4d topology metadata, not a 768d embedding"]
    }
  ],
  "summary": { "tables": 73, "with_jsonb": 41, "with_vector": 8 }
}
```

`row_estimate` comes from `pg_class.reltuples` (cheap, approximate). The
`notes[]` field is hand-curated in `src/lib/server/db/inspection-notes.ts`
so future inspectors don't mistake `manifold4` for a dense embedding.

### `db.table_inspect`

**Input**

```json
{
  "table": "graph_pathway_cards",
  "schema": "public",
  "include_columns": true,
  "include_indexes": true,
  "include_foreign_keys": true,
  "include_constraints": false
}
```

**Output**

```json
{
  "table": "graph_pathway_cards",
  "schema": "public",
  "columns": [
    { "name": "pathway_id", "type": "text", "nullable": false, "default": null },
    { "name": "metadata",   "type": "jsonb", "nullable": true,  "default": "'{}'::jsonb" }
  ],
  "indexes": [
    { "name": "graph_pathway_cards_pkey", "columns": ["pathway_id"], "unique": true, "method": "btree" }
  ],
  "foreign_keys": []
}
```

Pulls from `information_schema.columns`, `pg_indexes`, and
`information_schema.table_constraints`. No row data.

### `db.table_sample` (gated)

**Input**

```json
{ "table": "stored_assets", "limit": 3 }
```

- `limit` clamped to `[1, 5]`.
- `table` must be in `ALLOWED_INSPECTION_TABLES`.
- Forbidden columns scrubbed.
- Returns `null` for `bytea` / large JSONB > 4 KB; replaced with `{ "_omitted": "size>4kb", "byte_len": 8421 }`.

This tool **starts disabled in production** — it ships behind
`MCP_DB_SAMPLE_ENABLED=true`. The default subagents (`drizzle-inspector`)
do not list it in `allowed-tools`.

### `db.relation_map`

**Input**

```json
{ "root_table": "evidence_items", "depth": 2 }
```

**Output** — adjacency list of FK relationships up to `depth` hops, no
row data. Useful for `evidence-pipeline-auditor` to confirm the
9-stage pipeline writes to the expected downstream tables.

### `db.indexes`

Lists indexes for a table or for the whole schema. Surfaces:

- `gin_trgm_ops` indexes (DYM / fuzzy lookup),
- `hnsw` indexes (`vector_cosine_ops`, `halfvec_cosine_ops`),
- composite `(score DESC, id DESC)` indexes used for keyset pagination.

Helps the `topology-medic` subagent verify that pgvector + HNSW are
actually present where ACE expects them.

### `db.migration_status`

Reads `drizzle/meta/_journal.json` + lists files in `drizzle/`.
Returns: `{applied: [...], pending: [...], orphan_journal_entries: [...]}`.

This is what powers the **G29 destructive-SQL detector** under the
hood — same data source, two consumers (validator gate + MCP tool).

### `db.drift_check`

Compares three sources of truth:

1. Drizzle schema files (`src/lib/server/db/schema-postgres.ts` etc.).
2. `information_schema.columns` (live DB).
3. Manual SQL files in `drizzle/manual/`.

Returns drift report only:

```json
{
  "tables_only_in_db": ["legacy_kg_nodes"],
  "tables_only_in_schema": ["new_thing_drizzle_added"],
  "column_diffs": [
    { "table": "users", "column": "phone", "in_db": "varchar(32)", "in_schema": "text" }
  ]
}
```

**Never applies fixes.** Just surfaces them. Used to prevent
`drizzle-kit push` from silently dropping `legacy_kg_nodes` (the
documented "you're about to delete kg_nodes table with 2764 items"
incident in CLAUDE.md).

### `db.find_jsonb_keys`

**Input**

```json
{ "table": "embedded_summaries", "column": "output_meta", "key_prefix": "topology" }
```

**Output**

```json
{
  "keys": [
    { "key": "topology.cluster_id", "frequency": 9821, "sample_type": "string" },
    { "key": "topology.bmu_row",    "frequency": 9821, "sample_type": "number" }
  ],
  "scanned_rows": 10000
}
```

Implementation uses `jsonb_object_keys()` recursively over a sample
(default `LIMIT 10000`). No values returned — only keys + types +
frequencies. Critical for keeping the four JSONB envelope shapes (ACE,
topology, retrieval traces, audit) honest.

### `db.explain_read_query`

The **only** tool that takes raw SQL. Sandbox:

1. Strip leading whitespace + comments.
2. Reject if first keyword is not `SELECT` or `WITH`.
3. Wrap as `EXPLAIN (FORMAT JSON) <stmt>`.
4. Run inside `BEGIN READ ONLY; SET LOCAL statement_timeout = '2s'; … ROLLBACK;`.
5. Return the JSON plan.

Good for validating that a planned query uses the expected HNSW or
trigram index before someone writes a route handler around it.

## Registration sketch

Not implementing in this commit (docs first). When ready:

```ts
// src/mcp/db-inspection-tools.ts
import type { Pool } from 'pg';
import type { McpServer } from './trace-mcp-server.js';

export function registerDbInspectionTools(server: McpServer, pool: Pool) {
  server.tool('db.schema_overview',  schemaOverviewSchema,  (args) => schemaOverview(pool, args));
  server.tool('db.table_inspect',    tableInspectSchema,    (args) => tableInspect(pool, args));
  server.tool('db.relation_map',     relationMapSchema,     (args) => relationMap(pool, args));
  server.tool('db.indexes',          indexesSchema,         (args) => indexes(pool, args));
  server.tool('db.migration_status', migrationStatusSchema, ()     => migrationStatus());
  server.tool('db.drift_check',      driftCheckSchema,      ()     => driftCheck(pool));
  server.tool('db.find_jsonb_keys',  findJsonbKeysSchema,   (args) => findJsonbKeys(pool, args));
  server.tool('db.explain_read_query', explainSchema,       (args) => explainReadQuery(pool, args));
  if (process.env.MCP_DB_SAMPLE_ENABLED === 'true') {
    server.tool('db.table_sample', tableSampleSchema, (args) => tableSample(pool, args));
  }
}
```

Wired in `trace-mcp-server.ts` immediately after the existing pg pool
init, **before** any tool registration that does writes (so the
inspection tools always exist even if a write tool fails to register).

## Order of operations

1. Land this doc + `claude-code-agent-os.md`.
2. Add `.claude/agents/drizzle-inspector.md` referencing the tools by name (even before they exist — Claude Code will gracefully report unavailable tools).
3. Implement `db.schema_overview` + `db.table_inspect` only.
4. Add validator gate `G33 mcp:db-inspection-readonly` that asserts no `db.*` tool exposes a write verb in its inputSchema.
5. Iterate the rest of the catalogue.
