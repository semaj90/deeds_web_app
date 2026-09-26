---
name: drizzle-schema-review
description: Use when reviewing or modifying Drizzle ORM 0.45 schema for this project's PostgreSQL 18 + pgvector setup. Covers safe migration patterns, JSONB envelope conventions, pgvector imports, and the "never push, always migrate" rule.
---

# Drizzle schema review

This project uses Drizzle ORM 0.45.2 (drizzle-kit 0.31.10) against
PostgreSQL 18.4 + pgvector 0.8.3 (versions verified live 2026-09-23;
re-check `package.json` and `select extversion from pg_extension where
extname='vector'` before trusting them). Main schema is `src/lib/server/db/schema-postgres.ts` (70+
tables, 14 enums). The DB has real data; mistakes are expensive.

## The migration rule

**Always `drizzle-kit migrate`. Never `drizzle-kit push`.**

`push` will silently DROP tables that aren't in the schema (this has
already happened once with `kg_nodes`, ~2,764 items at risk). If you
see a prompt like:

```
Warning: You're about to delete kg_nodes table with 2764 items
```

→ **answer NO and Ctrl+C**. Then add the missing table to the schema
first, or add it to `tablesFilter` in `drizzle.config.ts`:

```ts
tablesFilter: ['!phase89_*', '!kg_*']
```

`G29` of the validator scans pending migrations for `DROP/TRUNCATE/DELETE`.
Run before merging any migration:

```bash
node scripts/validate/full-system.mjs --gate=G29
```

## Type inference

Always `$inferSelect` / `$inferInsert` from the table definition. Don't
maintain a parallel `DrizzleTypes` layer.

```ts
import { cases } from '$lib/server/db/schema-postgres.js';
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
```

## Imports

| Need | Import |
|------|--------|
| `db` client | `import { db } from '$lib/server/db/client'` *(no `.js`)* |
| Schema | `import { ... } from '$lib/server/db/schema-postgres.js'` *(yes `.js`)* |
| pgvector column | `import { vector, halfvec, sparsevec, bit } from 'drizzle-orm/pg-core'` (native) |
| Distance fns | `import { cosineDistance, l2Distance } from 'drizzle-orm'` |

Do **not** use `pgvector/drizzle-orm` (legacy experimental). Do **not**
add `.js` to `db/client` (breaks named export resolution despite the
general `.js` rule).

## pgvector 0.8 column + operator classes

Canonical semantic embedding is 768-dim (`codebase_chunk_index.content_embedding`
is `halfvec(768)`). Match the operator class to the column type:

| Column | HNSW opclass |
|--------|--------------|
| `vector(n)` | `vector_cosine_ops` / `vector_l2_ops` / `vector_ip_ops` |
| `halfvec(n)` | `halfvec_cosine_ops` / `halfvec_l2_ops` / `halfvec_ip_ops` |

Verify real dimensionality with `vector_dims(col::vector)`, not a metadata
column. pgvector 0.8 adds iterative index scans
(`SET hnsw.iterative_scan = relaxed_order`) so filtered ANN queries don't
under-return; set it per-transaction, not globally. Modes: `strict_order`
(exact ordering) or `relaxed_order` (better recall, slightly out of order).
Bounds: `hnsw.max_scan_tuples` (default 20,000) and `hnsw.scan_mem_multiplier`
(default 1x `work_mem`). Record which mode a proof used in its receipt.

## PostgreSQL 18 gotchas

- `isfinite(double precision)` / `isfinite(real)` no longer exist. Use
  `col NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)`
  in CHECK constraints and WHERE clauses.
- Verify any function overload with `pg_proc` before writing new SQL that
  assumes a PG16/17 builtin.

## Manual SQL for index features Drizzle can't express

Drizzle cannot emit `USING gin(col gin_trgm_ops)` or
`USING hnsw(col vector_cosine_ops) WITH (m=16, ef_construction=64)`
(Drizzle 0.45 can express `.using('hnsw', col.op('vector_cosine_ops'))`, but
keep production HNSW/GIN in manual SQL by policy: drizzle-orm issue #5792
reports `drizzle-kit push` regenerating HNSW DDL WITHOUT the operator class
(Postgres then fails with "no default operator class for access method
hnsw"); labelled fixed-in-beta, so not relied on in 0.31.10. Another reason
to never `push`.)
Pattern:

1. Define the table + plain B-tree indexes in `schema-postgres.ts`.
2. Add the GIN trgm / GIN array / HNSW indexes in a numbered file in
   `drizzle/` next to the matching auto-generated migration.

Example: `drizzle/0013_research_summaries.sql`.

## Cursor pagination

Use composite `(score DESC, id DESC)` + `WHERE (score, id) < ($cursor_score::real, $cursor_id::uuid)`. Never `OFFSET` for user-facing pagination.
Cursor encoding: `"{score}:{id}"`.

## DYM / fuzzy lookup

`pg_trgm` GIN index + `similarity(query, $input) > 0.25 ORDER BY sim DESC LIMIT N`. ~5 ms on 100 K rows.

## JSONB envelope conventions

Four envelope shapes recur:

- **ACE context envelopes** — `{queryTags, retrievalTrace, sources[], cacheHit}`
- **Topology envelopes** — `{cluster_id, bmu_row, bmu_col, manifold4: [x,y,z,w]}`
- **Audit envelopes** — `{event_type, sha256, prev_sha256, actor, ts}`
- **Retrieval traces** — `{stages: [{name, latency_ms, hit_count}], total_ms}`

When adding new JSONB columns, add a GIN index unless the column will
only ever be read whole, never queried by key.

## Anti-patterns

- Renaming a column without an explicit `ALTER TABLE … RENAME COLUMN` SQL — Drizzle generates DROP+ADD which destroys data.
- Returning all columns when one query needs only 3 (use `.select({ id: t.id, … })`).
- Bypassing the `pg.Pool` singleton in `db/client` and constructing a fresh client per request.
- Storing binaries in Postgres — they belong in object storage (see proposed [SeaweedFS plan](../../../next_steps/active/2026-05-09_object-storage-seaweedfs.md) when it lands).

## Related skills + tools

- `drizzle-inspector` agent (`.claude/agents/drizzle-inspector.md`) for read-only schema inspection through MCP.
- [docs/architecture/drizzle-inspection-mcp.md](../../../sveltekit-frontend/docs/architecture/drizzle-inspection-mcp.md) for the planned `db.*` MCP tool catalogue.
