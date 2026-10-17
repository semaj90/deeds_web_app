# GraphV2 SearchRuntime fanout implementation note — 2026-10-16

Status: `CODE_WIRED_TESTS_UNVERIFIED_LIVE_GRAPH_BLOCKED`

## Changes

- Added a bounded read-only GraphV2 fanout reader over existing `atlas_graph_edges_v2` and `atlas_graph_relation_participants_v2`; no new table or writer was introduced.
- Wired its packet candidates into SearchRuntime before normal fusion, hydration, and final Top-K. The reader requires an exact validated snapshot revision, exact source-bound seed nodes, and exact packet/node/source revision readback. N-ary participants additionally require snapshot topology-hash agreement and source/evidence metadata.
- Audited PageRank execution ownership: Neo4j GDS and cuGraph are backends under `graph-analysis-runner.ts`, writing the same `graph_analysis_runs` and `graph_node_metrics` contract. NetworkX is currently a CPU fixture/parity oracle, not an ACP/A2A task backend or production SearchRuntime executor.
- Found that `feature-matrix.ts` combines legacy authority score/run tables with GraphV2 snapshot fields. The ownership registry classifies both authority-table generations as non-canonical/experimental, so a speculative switch to V2 was backed out. PageRank score admission remains unresolved; do not promote either authority table from this change.

## Validation and limits

- Added focused reader tests for query contract and fail-closed input/readback handling.
- Two attempts to run the focused Vitest file hung without reporting test discovery or results and were interrupted. Do not count tests as passed.
- TypeScript `transpileModule` syntax checks passed for the new reader, its spec, and SearchRuntime. This is syntax validation, not type checking.
- `git diff --check` passed for the touched implementation paths.
- No live database query, migration, graph materialization, cache write, projection, source backfill, or GPU work was performed.
- Previously reported live census remains the blocker: no `VALIDATED` GraphV2 snapshot was observed, and qualified N-ary code facts were absent. The implementation cannot manufacture these rows. Separate ACP/A2A PageRank tools are not indicated: ACP may expose a bounded analysis task, and A2A may delegate long-running work, but neither should own the calculation, persistence contract, or add another retrieval vote.

## Required next proof

Run the focused reader and SearchRuntime specs in a functioning Vitest environment; then perform a bounded read-only live census/traversal against one approved validated GraphV2 snapshot. Separately resolve the canonical PageRank run/score persistence contract and exact source-revision bindings before reconnecting that score to SearchRuntime. Continue to require final Top-K, ContextManifest admission, and independent readback before claiming GraphRAG production readiness.

```yaml
likely_cause: SearchRuntime had no GraphV2 candidate reader; PageRank has multiple execution backends but no agreed source-revision-qualified score authority for retrieval.
evidence: sveltekit-frontend/drizzle/0112_parent_atlas_graph_v2.sql; docs/architecture/runtime-ownership-registry.json; sveltekit-frontend/src/lib/server/graph/graph-analysis-runner.ts; focused reader test (added, runner hung); transpile syntax checks.
patch_targets:
  - sveltekit-frontend/src/lib/server/atlas/integration/graph-v2-retrieval-fanout-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/integration/graph-v2-retrieval-fanout-v1.spec.ts
  - sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts
  - sveltekit-frontend/src/lib/server/retrieval/feature-matrix.ts
safe_next_command: "npx vitest run src/lib/server/atlas/integration/graph-v2-retrieval-fanout-v1.spec.ts src/lib/server/retrieval/__tests__/feature-matrix.test.ts --reporter=dot --pool=forks --poolOptions.forks.singleFork=true"
smoke_command: "npx vitest run src/lib/server/atlas/integration/graph-v2-retrieval-fanout-v1.spec.ts src/lib/server/retrieval/__tests__/feature-matrix.test.ts --reporter=dot --pool=forks --poolOptions.forks.singleFork=true"
report_path: docs/reports/graph-v2-searchruntime-fanout-20261016.md
