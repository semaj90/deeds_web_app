# Drizzle ORM Audit TOC

Purpose: navigate the active Drizzle schema, migration lineage, application
consumers, and PostgreSQL readbacks. This is a review index, not a second schema
or a generated replacement for PostgreSQL catalogs.

## Ownership and entry points

- Active TypeScript schema: `sveltekit-frontend/drizzle/schema.ts`.
- Tracked SQL migrations: `sveltekit-frontend/drizzle/`.
- Drizzle migration journal: `sveltekit-frontend/drizzle/meta/_journal.json`.
- Sidecar migration registry:
  `sveltekit-frontend/drizzle/sidecar-migrations.json`.
- Introspected snapshots under `drizzle/introspected/` are historical/import
  artifacts unless explicitly adopted; they do not silently override the
  active schema or migration journal.
- Existing auditors: `scripts/atlas/audit-drizzle-postgres-contracts.mjs`,
  `scripts/atlas/drizzle-schema-drift-audit.mjs`,
  `scripts/atlas/audit-drizzle-migration-integrity.mjs`, and
  `scripts/atlas/audit-drizzle-meta-hygiene.mjs`.

## Per-relation audit fields

Maintain a read-only relation map with these fields:

| Field | Meaning |
| --- | --- |
| `relationKey` | schema-qualified PostgreSQL relation name; never a display-only alias |
| `activeDrizzleOwner` | exported `pgTable`/view declaration and source path, or explicit `MISSING` |
| `databaseObserved` | catalog presence and observed relation kind at a named run/revision |
| `columns` | ordered name, SQL type, null/default/generated/identity/comment metadata and matching Drizzle property/type |
| `constraints` | primary/foreign/unique/check definitions and validation/readback state |
| `indexes` | SQL definition, method/opclass/expression/predicate, matching Drizzle declaration and migration source |
| `migrationLineage` | journal tag/index/timestamp or sidecar ID/path/checksum; unregistered manual SQL is explicitly flagged |
| `consumers` | route/service/query references and fields/operators they actually select/filter/order by |
| `extensions` | PostgreSQL extension dependency plus separate Node package/runtime consumer and version |
| `representation` | for vectors: named representation, dimensions, distance/opclass, and producer revision; for JSONB: schema/validator and query operators |
| `contractStatus` | `MATCHED`, `DRIFTED`, `UNREGISTERED`, `DATABASE_ABSENT`, `SCHEMA_ABSENT`, `AMBIGUOUS`, or `NOT_CHECKED` |
| `evidence` | run ID, workspace revision, source checksum, read-only status, report path, and readback checksum where available |

## Required cross-checks

1. Compare active `schema.ts` exports with PostgreSQL relations and columns;
   report missing relations separately from missing columns.
2. Reconcile every tracked migration with `_journal.json`; reconcile approved
   sidecars with `sidecar-migrations.json`. Never register an old manual SQL
   file unchanged merely to make the audit green.
3. Compare route/service SQL with the actual Drizzle and database column names.
   An introspected declaration is evidence of history, not proof that current
   application queries match it.
4. Audit JSONB declarations by actual operator. Distinguish JSONB GIN
   `jsonb_ops` from `jsonb_path_ops`; use B-tree expression indexes only for
   identified scalar predicates and preserve migration ownership/rollback.
5. Audit FTS fields and query lanes (`tsvector`, GIN, `pg_search`, and labeled
   `postgres_fts`) without inventing a second FTS owner.
6. Audit pgvector fields with the exact column, dimension, representation,
   model/input revision, distance operator, index type, migration, and readback.
   Canonical `semantic_768` is 768 dimensions; 384 is legacy-only, not a new
   write target.
7. Audit PostgreSQL extensions through `pg_extension` and application
   packages through the Node package manifest/lockfile as separate inventories.
   Label package/runtime ownership; do not call a Node dependency a PostgreSQL
   extension.
8. Record Merkle/checksum lineage as integrity metadata on the audited
   artifact set; Merkle is not an index type and must not replace migration
   IDs, relation names, or canonical record identity.

## Migration safety

- Use additive, scoped, tracked migrations; use `CREATE` when the live relation
  is absent and a narrowly justified `ALTER` only when the relation exists and
  has been inspected.
- For live data, use the repository migration runner (`migrate`), never
  `drizzle-kit push`.
- Validate migrations against a disposable PostgreSQL instance, then verify
  catalog shape and application readback. A successful TypeScript schema check
  alone does not prove the live database was migrated.
- Do not run global migrations while journal/sidecar baseline integrity is
  unresolved. No audit command in this TOC authorizes a live apply.

## Existing audit commands

```powershell
npm run audit:drizzle
npm run audit:contracts
node scripts/atlas/audit-drizzle-postgres-contracts.mjs --dry-run
```

Confirm the current script options before use. Auditors should be read-only,
bounded, revision-stamped, and report-only; migration execution is a separate
authorized operation.

## Current review queue

- [ ] Add active Drizzle ownership for `phase72_error` only after route fields
  and intended API contract are reconciled; then author and register a scoped
  migration. The current live absence calls for initial creation, not `ALTER`.
- [ ] Resolve the `concept_evidence` query to its true schema owner or make the
  metric explicitly unavailable when that relation is absent.
- [ ] Reconcile repeated JSONB GIN declarations with their migration history and
  query workload before changing active schema or dropping live indexes.
- [ ] Keep historical introspected snapshots labeled as non-authoritative until
  a deliberate adoption/reconciliation proves parity.

