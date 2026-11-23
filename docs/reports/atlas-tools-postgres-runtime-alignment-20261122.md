# Atlas Tools PostgreSQL Runtime Alignment

Date: 2026-11-22
Change: `parent-atlas-pass-fabric`
Scope: read-only MCP routing and PostgreSQL 18 connectivity check

## Result

The connected Atlas tool surface and the repository's local stdio MCP server do
not currently behave the same way. PostgreSQL 18 is reachable from the local
server, but the connected `mcp__atlas_tools` calls still report the legacy
`neo4j_projection` authority. This is a runtime alignment blocker, not evidence
that PostgreSQL is down.

## Evidence

- Connected `trace_system_health`: PostgreSQL reported `ok`; TRACE MCP on
  `127.0.0.1:8788` returned HTTP 200. Optional reranker and topology search
  were down.
- Connected `find_dependencies` for
  `src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts`: returned
  `authority=neo4j_projection`, `graphRevision=null`, and
  `PROJECTION_MISSING_FILE`.
- Connected `trace_database` query `PostgreSQL 18 LangChain`: returned no
  traces and `authority=neo4j_projection`.
- The current app tool inventory does not expose `inspect_postgres_backend`.
- Both repository MCP configurations checked, root `.mcp.json` and
  `opencode.json`, register local `atlas-tools` to
  `node ./sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`.
- A fresh local stdio call to `inspect_postgres_backend` returned
  `status=READY`, PostgreSQL major version 18, database `legal_ai_db`, and
  `transactionReadOnly=true`. It found both canonical source tables and graph
  v2 tables. It found two snapshots, both `SUPERSEDED`, zero non-superseded
  snapshots, and zero revision-qualified snapshots. Build revision:
  `8fb33870c38110b1e62bef502083f37ee10c7bad43f65694f772cd5aa6409c11`.
- A fresh local stdio `find_dependencies` call returned
  `authority=atlas_typed_graph_projection` and `SOURCE_NOT_INDEXED` for the
  TensorHandle target. It did not fall back to Neo4j.
- A fresh local stdio `trace_database` call used
  `POSTGRESQL_CODE_INDEX_FTS`, but query `feature_file_edges` exceeded the
  handler's 5-second statement timeout (`POSTGRES_QUERY_FAILED:57014`). This
  confirms the local route selection, while leaving live FTS query latency and
  candidate readback unresolved.
- A read-only PostgreSQL graph-source audit confirmed version 18.4 and found
  483,801 graph nodes / 224,764 graph edges across two snapshots; both
  snapshots are `SUPERSEDED` with null graph, source-inventory, and workspace
  revisions. The target basename returned no candidate rows in graph nodes,
  `code_features`, Graphify inventories/membership, or `codebase_chunk_index`.
- The audit previously missed the `code_feature_edges.relation` column. After
  fixing its safe-column allowlist, the 6,558 rows group as 3,018 `SAME_SYMBOL`,
  2,072 `SUPPORTS_IN_FILE`, 1,358 `NEXT_IN_FILE`, and 110 `DEPENDS_ON`. Sampled
  `DEPENDS_ON` records have confidence `0.1` and null `evidence_ref`; the table
  has no source/workspace revision columns. They are not admissible dependency
  edges. `phase89_import_edges`, `cpg_edges`, and `atlas_typed_edges` remain
  empty.
- Aggregate verification confirms all 110 `DEPENDS_ON` edges have 11 distinct
  source and target feature IDs, confidence `0.10000000149011612`, and zero
  non-null `evidence_ref` values. This exactly matches the existing
  `populate-code-feature-edges.mjs --complete-graph` recipe: emit both
  directions for every pair and assign `1/(feature_count-1)`. Its insert stores
  only endpoint IDs, relation, and confidence. Treat these edges as synthetic
  topology for PageRank, not source-backed imports/dependencies.
- `node --test scripts/mcp/atlas-tools-mcp.test.mjs`: 44 passed, 0 failed.
- `node --test scripts/atlas/audit-graph-sources-readonly-v1.test.mjs`: 4
  passed, 0 failed. The aggregate edge-quality audit receipt is
  `docs/reports/atlas-graph-source-audit-followup-v4-20261122.json`.
- No services were restarted. No database or cache writes were performed.

## Interpretation and next gate

The local source/configuration and hermetic tests are not the failing boundary.
The currently connected tool facade either has not adopted this local stdio
server or is connected to a separate legacy Atlas handler; its process/config
identity is not exposed, so the exact cause is not yet distinguished. This
session has no tool to reload that MCP registration.

Refresh/reconnect the `atlas-tools` server entry (not TRACE alone) in the client
that owns the active tool registration. Then verify that the tool list includes
`inspect_postgres_backend`, call it, and compare its `serverBuildRevision` with
the hash above. Repeat `find_dependencies`; the expected unresolved result is a
typed PostgreSQL/source-index or graph-plan failure, never
`neo4j_projection`. The dependency graph itself remains blocked because the
database inspection found no current revision-qualified graph snapshot.

The `trace_database` timeout should be handled as a separate bounded-query
performance issue. Do not increase the timeout blindly or change indexes until
the current query plan and its existing index coverage are inspected read-only.

## Read-only `trace_database` query-plan follow-up

PostgreSQL 18.4 has the expected GIN index on
`codebase_chunk_index.search_vector` and B-tree indexes on
`atlas_workspace_source_bindings(repo_id, canonical_source_ref, ...)`. The
current query plan uses the GIN index for FTS, then scans an estimated 93,500
source-binding rows because a three-way `OR` in the join prevents indexed
lookups. A candidate lateral join with three indexed equality branches uses the
existing B-tree index and reduces planner estimated total cost from 11,641.88
to 1,408.35.

Both query forms were run inside a read-only transaction for
`feature_file_edges`. They returned identical 107-row result sets with SHA-256
`1ca7243e68c59c5842bb6e8ac7e68473d51f9ca75f73b41838d30b79123b6287`. The
candidate query alone returned 107 rows in 34.39 ms with a 5-second statement
timeout. The paired old/candidate equivalence check completed in about 17
seconds overall; per-query timing for the old query was not captured. No index,
database row, or service was changed.

The local `trace_database` SQL now uses the indexed join shape, with a focused
regression asserting that the three-way `OR` is absent. Its complete MCP test
file passes 45/45. The connected MCP facade still reports the old
`neo4j_projection` authority; the local SQL change is not live there until the
active Atlas Tools registration is refreshed. This optimization fixes only the
local FTS timeout. It does not create current dependency edges or make
`find_dependencies` resolve the TensorHandle target.

OpenSpec task `KERNEL-GRAPH-DEPENDENCY-MIGRATION-01` remains open. This report
does not qualify the graph, admit edges, or authorize persistence.

## Local-byte mismatch disposition

The four records counted as `localSourceBytesMismatch` in the existing
`current-source-graphify-batch-plan-v1.json` were rechecked without printing
file contents. All four current files still match that plan's own recorded
local byte length and SHA-256. The discrepancies are between those bytes and
the source-binding metadata (`sourceRevision`, `contentDigest`, and
`byteLength`), not changes since the plan was written. All four paths are under
`.claude/`, including `settings.local.json`. No files or database rows were
changed. These records should remain blocked until an approved current
workspace snapshot and source-inclusion policy establish which metadata is
authoritative; do not automatically rebind or refresh them into Graphify.
