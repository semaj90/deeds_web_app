# HyperRAG lineage owner review

- Status: `NOT_PROVEN`; read-only audit only.
- Existing owners: `SearchRuntime` owns fusion/rerank; `KagQuickHopV1` owns the bounded pure incidence traversal and receipt contract; `hyperrag-packet-rpc.ts` maps supplied neighbors but does not expand; `unified-orchestrator.ts` does not populate `neo4j_neighbors`.
- Live revision binding: `atlas_hyperedges` has 62,802 rows, all bound to graph revision `taxonomy-edges-v1-2026-05-08` and workspace `git:0084288f26`. The currently admitted workspace revision is `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; these graph rows therefore cannot be used for current-workspace expansion. `atlas_relationships` and `atlas_graph_snapshots_v2` do not expose `graph_revision`.
- Bounded-read hardening: `readKagHyperedgesStrictV1` caps inputs at 256 canonical IDs, orders rows deterministically, requests at most 4,097 rows, and rejects overflow above 4,096 member rows rather than returning a partial hyperedge. Four focused Vitest files passed 41 tests, including overflow rejection and the existing quick-hop/RPC/fusion contracts. These are mocked/contract tests, not a live graph query.
- Proof boundary: `MULTIHOP-FILL-01` remains open. No historical-revision join, graph refresh, or writes were performed. Do not run `graphify:daily` to clear the stale-graph warning.
- Required next gate: establish the current workspace-bound graph snapshot/analysis writer; bound incidence query results; then produce a revision-bound receipt for dense nomination → canonical identity → bounded k-hop → canonical dedup → rerank.
- Focused validation: Vitest on `kag-quick-hop-v1.spec.ts`, `kag-hypergraph-reader-v1.spec.ts`, `hyperrag-packet-rpc.identity.spec.ts`, and `search-runtime-fusion.test.ts` passed 41 tests after the bounded-reader change.
- Live owner audit: `docs/reports/graph-revision-owner-v1-current-20261003.json` (`readOnly: true`, `nextGate: TRACE_GRAPH_SNAPSHOT_OR_ANALYSIS_WRITER_TO_CURRENT_WORKSPACE_REVISION`).
- Fresh read-only recheck: `audit-graph-revision-owner-v1.mjs` wrote only to `%TEMP%\graph-revision-owner-v1-20261003155335.json`. It again found 62,802 hyperedges on the old `git:0084288f26` workspace and `taxonomy-edges-v1-2026-05-08` graph revision, versus expected workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; 603 relationship rows and 2 graph snapshots lack graph-revision columns. This confirms the production lineage blocker; no current-workspace expansion was attempted.
- Writes performed: `false`; canonical authority: `false`; mutation authorized: `false`.

## Skill execution fields

- `likely_cause`: HyperRAG packet RPC receives no neighbors, and existing incidence rows are bound to an older workspace revision.
- `evidence`: `sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts`; `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts`; `sveltekit-frontend/src/lib/server/retrieval/kag-quick-hop-v1.ts`; `scripts/atlas/audit-graph-revision-owner-v1.mjs`; `docs/reports/graph-revision-owner-v1-current-20261003.json`.
- `patch_targets`: `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`; `docs/reports/hyperrag-lineage-owner-review-v1-20261003.md`.
- `safe_next_command`: `node scripts/atlas/audit-graph-revision-owner-v1.mjs --output=docs/reports/graph-revision-owner-v1-current-20261003.json`.
- `smoke_command`: `node --test sveltekit-frontend/src/lib/server/retrieval/kag-quick-hop-v1.spec.ts sveltekit-frontend/src/lib/server/retrieval/kag-hypergraph-reader-v1.spec.ts sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.identity.spec.ts sveltekit-frontend/src/lib/server/search-runtime/__tests__/search-runtime-fusion.test.ts`.
- `report_path`: `docs/reports/hyperrag-lineage-owner-review-v1-20261003.md`.
