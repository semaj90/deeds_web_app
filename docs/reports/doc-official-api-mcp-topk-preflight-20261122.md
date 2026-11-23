# Official API Docs and MCP Top-K Preflight

Date: 2026-11-22  
OpenSpec change: `parent-atlas-versioned-doc-intelligence`  
Scope: local MCP implementation, connected MCP behavior, read-only PostgreSQL readiness, and official Firecrawl documentation availability.

## Findings

- The local Atlas MCP source contains `inspect_postgres_backend`. Its live local read-only inspection reports PostgreSQL 18 reachable and the required source and graph tables present. It starts a read-only transaction and reports `writesPerformed=false`.
- The connected MCP runtime is not serving that local implementation. Its surfaced tools omit `inspect_postgres_backend`; connected `find_dependencies` still reports `authority=neo4j_projection` and `PROJECTION_MISSING_FILE`, while `trace_database` also identifies the Neo4j projection. No MCP reload or process restart was attempted.
- The local MCP implementation now advertises version `0.3.0` and a SHA-256 fingerprint of its source file. After an approved refresh, compare both fields to confirm that the connected process loaded the current implementation.
- `node --test scripts/mcp/atlas-tools-mcp.test.mjs` passed 42 tests, including the read-only PostgreSQL inspector and fail-closed local graph dependency resolver. This is local implementation proof, not proof of connected MCP behavior.
- A direct PostgreSQL query in a read-only transaction found no exact canonical external-document record for `https://docs.firecrawl.dev/quickstart`. The prior Firecrawl MCP capture and Stanza relation candidates remain local, noncanonical proposal artifacts; they are not eligible canonical citations or ACE inputs.
- No Firecrawl request, database/cache/vector/Graphify write, task-status change, or MCP lifecycle action occurred.

## Local MCP tool follow-up

`trace_database` now uses PostgreSQL FTS over `codebase_chunk_index`, joins the latest unambiguous source binding, verifies candidate source bytes against the current workspace file, and returns at most 50 source/chunk candidates with source and workspace revisions and binding observation time. File checks are capped at 2 MiB each and 16 MiB total. Results are explicitly `LEXICAL_MENTION_CANDIDATE`; this tool does not assert a `USES_DB` relation. The query runs inside `BEGIN READ ONLY` and rolls back.

The live local MCP stdio initialize + `tools/call` returned 50 candidates for `codebase chunk index` with `POSTGRESQL_CODE_INDEX_FTS`, `canonicalAuthority=false`, and `writesPerformed=false`; 207,372 bytes were hashed and six stale or unverifiable raw rows were excluded. The focused suite passes 44/44.

The dependency lookup remains incomplete end to end: local MCP calls to `find_dependencies` for both `sveltekit-frontend/src/lib/server/atlas/docs/doc-intelligence-read-model.ts` and `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs` returned `SOURCE_NOT_INDEXED`. A source-indexed file with matching current bytes returned `SOURCE_INDEX_REVISION_CONFLICT` because historical workspace bindings are not disambiguated by the tool. The structural-edge plan is `CURRENT_STRUCTURAL_EDGE_PLAN_INCOMPLETE`, with zero selected sources/nodes/edges and null `graphRevision`. No live dependency edges or NetworkX graph answer were proven. A fresh connected MCP check still returned the old Neo4j behavior: `trace_database` returned zero traces with `authority=neo4j_projection`, and `find_dependencies` returned `NO_OUTGOING_EDGES` with a null graph revision. The connected runtime requires the approved refresh before its tool list and behavior can be rechecked.

## Graph readiness inspector follow-up

The local MCP inspector is now version `0.4.0`. A real local MCP stdio initialize and `tools/call` returned the extended summary from a read-only PostgreSQL transaction. Live result: database `legal_ai_db`, PostgreSQL 18, transaction read-only; graph status `SUPERSEDED_OR_REJECTED_ONLY`; two superseded snapshots; zero with graph/workspace/source-inventory revisions; zero non-superseded snapshots. The 224,764 edges are all attached to superseded snapshots: `CONTAINS` 112,382, `MATERIALIZES` 58,304, `DERIVED_FROM` 54,078. Thus inspector `status=READY` means the database and required tables are present; it does not mean the dependency graph is ready.

The existing source plan is `CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_REVIEW` at workspace revision `sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c`; it has zero exact current Graphify sources, 39 missing Graphify sources, 8 ambiguous, 81 revision/content mismatches, and 4 local byte mismatches. The current source-authority receipt says `NO_CURRENT_SOURCE_SET` at `sha256:ec542383b52ed4c597750d4273522239284fdb3d819619414df5f36333f85e1f`, while the empty structural-edge plan is pinned to another revision (`sha256:f476b4a6aac2afcafe0f82c7b0e48d52951ccbce73fca52b9706b1f1fbfabefb`). The existing owner defers another Graphify run until a clean/current bound source pass or admitted selector run. `find_dependencies` still consumes the local revision-qualified artifact and cannot use these superseded PostgreSQL snapshots as a substitute. Other Neo4j-backed `find_feature`, `find_route`, `trace_tool_chain`, and name-based `find_source_refs` are outside this migration slice. No source-binding or graph write was attempted.

## Remaining sequence

1. Refresh or reconnect the configured Atlas MCP process through its approved operator workflow.
2. Call `inspect_postgres_backend`; verify version `0.4.0`, a 64-character source fingerprint, PostgreSQL 18 readiness, `graphSnapshotSummary`, and `writesPerformed=false`.
3. Verify the Firecrawl official-doc page through the existing canonical capture/admission owner, then independently read back its page/chunk identities, revisions, checksums, and byte spans. Keep it unadmitted if source revision or authorization evidence is incomplete.
4. Evaluate exact lookup, PostgreSQL FTS, semantic, and admitted graph lanes on one frozen reviewed query set. Record top-K identity and citation correctness; do not treat PageRank or similarity as relation evidence.
5. Only after canonical retrieval and review gates pass, compose a bounded ACE ContextManifest. Treat Valkey publication/readback as a distinct authorized step with TTL, revision scope, checksum, and invalidation proof.

## Status

`CREATED`: local inspector (v0.4.0), source fingerprint, and PostgreSQL-backed `trace_database` are present.  
`WIRED`: local stdio dispatch exercises the inspector and FTS candidate search; source bytes are bounded-hash checked. Dependency lookup still lacks current source bindings and a ready graph artifact.  
`PROVEN`: local PostgreSQL FTS tool call via MCP stdio, 50 returned candidates, current-source hash filtering, and 44 focused MCP tests; connected MCP remains old.  
`DONE`: not achieved. DOC-14 and DOC-15 remain open; canonical official-doc capture, reviewed top-K quality, live dependency graph resolution, ACE admission, and cache readback are not proven.

## Closeout

- **likely_cause:** No current source set is admitted, available graph snapshots are superseded and revision-unqualified, and the connected MCP process is stale.
- **evidence:** MCP tests 44/44 passed; local inspector reports 2 superseded snapshots and 0 revision-qualified snapshots; source plan has 0 exact current sources; structural plan has 0 nodes/edges; local stdio `trace_database` returned 50 current-source-hash-checked candidates; connected tool output still named `neo4j_projection`.
- **patch_targets:** `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`, `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.test.mjs`, `openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md`.
- **safe_next_command:** `node --test scripts/mcp/atlas-tools-mcp.test.mjs` from `sveltekit-frontend`.
- **smoke_command:** After the approved MCP refresh, call `inspect_postgres_backend` and verify server version, source fingerprint, PostgreSQL readiness, and `writesPerformed=false`.
- **report_path:** `docs/reports/doc-official-api-mcp-topk-preflight-20261122.md`.
