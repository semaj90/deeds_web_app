# PostgreSQL Audit TOC

Purpose: a navigational and field checklist for read-only PostgreSQL inventory.
This document is not a schema authority, migration, or index prescription.
PostgreSQL is the canonical data/lineage authority where the owning contracts
assign it that role; this TOC only points to the relevant owners and audits.

## Ownership and entry points

- Active application schema declarations: `sveltekit-frontend/drizzle/schema.ts`.
- Tracked migrations and journal: `sveltekit-frontend/drizzle/` and
  `sveltekit-frontend/drizzle/meta/_journal.json`.
- Explicit sidecar migration inventory:
  `sveltekit-frontend/drizzle/sidecar-migrations.json`.
- Existing index capability audit: `scripts/atlas/audit-postgres-index-capability-v1.mjs`.
- Existing Drizzle/PostgreSQL contract audit:
  `scripts/atlas/audit-drizzle-postgres-contracts.mjs`.
- Existing runtime audit: `scripts/atlas/audit-postgresql18-runtime-v1.mjs`.
- Existing report directory: `docs/reports/` (reports are observations, not
  schema authority).

## PostgreSQL inventory fields

Every audit run should record the following, when observable:

| Area | Fields to capture |
| --- | --- |
| Run provenance | `auditId`, `generatedAt`, `workspaceRevision`, server version, database/schema scope, connection identity class (never credentials), read-only flag, report checksum |
| Relations | schema, relation name/kind, owner, persistence/partition status, row estimate, size, canonical owner, lifecycle, source migration |
| Columns | ordinal, name, PostgreSQL type, nullability, default/generated/identity expression, collation, comment/label, Drizzle declaration, migration provenance |
| Constraints | primary/foreign/unique/check/exclusion constraints, definitions, validation state, referenced relation, deferrability |
| Indexes | name, relation, access method (`btree`, `gin`, `gist`, `brin`, `hnsw`, `ivfflat`, etc.), key/expression, opclass, predicate, uniqueness, validity/readiness, size, observed scans, stats reset time, owning migration |
| Extensions | extension name/version/schema/relocatable status, installed-vs-available state, owning migration, consuming Node/Python/Go component, capability label |
| JSONB | relation/column, actual query operators (`@>`, `?`, `@?`, `@@`, scalar extraction), matching GIN opclass (`jsonb_ops`/`jsonb_path_ops`) or targeted expression B-tree, duplicate-definition group |
| B-tree/BRIN | concrete equality/range/order predicate, leading columns/expression, selectivity/correlation evidence, table size, `EXPLAIN` reference; BRIN only when physical ordering/correlation supports it |
| FTS | source columns, `tsvector` expression/generated column, text-search config, GIN or existing `pg_search` owner, query API/lane label, freshness/readback evidence |
| pgvector | extension version, relation/column, dimensions, representation (`semantic_768` or named derived representation), distance/opclass, exact/HNSW/IVFFlat executor, model/input revisions, parity receipt |
| Runtime extensions | PostgreSQL extension inventory is separate from Node package inventory; record the Node package/version/runtime consumer in its own field rather than calling it a database extension |

`Merkle` is an integrity/checksum structure, not a PostgreSQL index access
method. If a table, migration set, or audit output uses a Merkle root, record
the canonical input set, leaf serialization/hash algorithm, root, and revision
separately from B-tree/GIN/BRIN index metadata.

## Index review rules

- Do not replace JSONB GIN indexes wholesale with B-tree indexes. Choose the
  access method from real predicates: GIN for supported JSONB containment/key/
  path operators; targeted B-tree expression indexes for measured scalar
  equality, range, or ordering predicates.
- `jsonb_ops` and `jsonb_path_ops` have different operator coverage. Record the
  caller/operator and opclass before proposing consolidation.
- Treat identical table/expression/opclass/predicate definitions as duplicate
  candidates, not automatic drops. Compare migration provenance, dependencies,
  workload, index validity, and rollback path.
- `idx_scan = 0` is not sufficient evidence for removal. Include a stable
  observation window and `stats_reset`; capture representative
  `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` evidence when safe.
- BRIN is a candidate for large physically correlated data (for example,
  append/time-ordered ranges), not a generic smaller replacement for B-tree.
- GIN/BRIN/B-tree/HNSW/IVFFlat inventories describe execution structures;
  PostgreSQL's planner remains free to choose sequential, index, or bitmap
  plans. A specific plan node is not a correctness contract.
- Do not run DDL or `drizzle-kit push` as part of inventory. Proposed changes
  require an owner, tracked migration, disposable validation, and readback.

## Existing audit commands

From the repository root:

```powershell
npm run atlas:docs:postgres-index-capability
npm run audit:drizzle
npm run audit:contracts
```

These are audits, not authorization to mutate the live database. Check each
script's current flags and output before running it; preserve reports as
run-scoped evidence and do not infer current state from a filename such as
`latest`.

## Current review queue

- [ ] Reconcile missing `phase72_error` against route query fields, active
  Drizzle schema, journal, and sidecar registry before drafting a create
  migration.
- [ ] Identify the authoritative owner/semantics for the `concept_evidence`
  startup probe; do not create a parallel concept table.
- [ ] Review duplicate `atlas_packets` JSONB GIN definitions against callers,
  stable statistics, and plans before proposing a cleanup migration.
- [ ] Audit extension versions and consumers, including `vector`, `pg_trgm`,
  `pg_search`, and Node runtime packages, without conflating their ownership.

