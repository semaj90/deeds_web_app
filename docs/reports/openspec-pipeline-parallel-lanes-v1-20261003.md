# OpenSpec pipeline parallel-lane status — 2026-10-03

Read-only and dry-run results from the embedding, TaskCard, HyperRAG, and incremental-runner lanes. No commit, Graphify run, canonical task-state mutation, database/vector/cache/archive write, or embedding migration occurred.

| Lane | Status | Evidence and next gate |
|---|---|---|
| Embedding endpoint convergence | `CENSUS_PROVEN; MIGRATION_BLOCKED` | 125 production-source hits classify as 78 live direct callers, 9 wrappers (3 direct-call wrappers and 6 facade-only), 10 reachable non-callers, 18 dormant, 6 transport owners, and 4 diagnostics. The schema-v2 guard passes with zero new bypasses. None of the 78 callers has a proven owner-to-`semantic_768` cohort and recipe join; keep callers unchanged until `CALLER_TO_SEMANTIC_768_COHORT_JOIN_MISSING` and `CALLER_RECIPE_AND_PRODUCER_REVISION_UNPROVEN` close. Details: `embedding-direct-endpoint-reconciliation-v1-20261003.md` and `embedding-direct-endpoint-census-v1-20261003.json`. |
| TaskCard / selector / ranker | `OWNER_GATE_PASS; RANK_FEATURES_OPEN` | `TaskCardV1` survives as the sole task projection. `selectOpenSpecTaskCardsV1` owns the selection/checksum; ranker consumes its exact set. Raw Workboard ranking is explicitly legacy. Same-revision parity is 10,463 matched, zero board-only/card-only or revision mismatch. Earlier 337/1,742 values compared a different EvidenceCard universe and are invalid as TaskCard unmatched counts. Details: `wb-taskcard-owner-v1-20261003.md` and `wb-taskcard-population-parity-v1-20261003.md`. |
| HyperRAG lineage | `MULTIHOP_LINEAGE_UNPROVEN` | 62,802 hyperedges / 125,604 members are bound to stale workspace `git:0084288f26` and graph `taxonomy-edges-v1-2026-05-08`. Relationship/snapshot tables lack `graph_revision`; the RPC starts with empty `neo4j_neighbors`, and no production expansion caller was found. Require current revision-bound incidence and bounded-neighbor population before live proof. Details: `hyperrag-lineage-audit-lane-c-v1-20261003.md`. |
| Incremental runner | `DRY_RUN_WIRED` | Added explicit `--incremental --dry-run` path using the committed dirty-set stage. Smoke returned `CLEAN`, 0 dirty / 11,024 unchanged, with `writesPerformed:false`; default full-run behavior is unchanged. Details: `scripts/atlas/run-openspec-evidence-fabric-v1.mjs` and its focused test. |

## Validation

- Focused tests: 57 passed across embedding census, dirty-set, runner, TaskCard, triage selector, manifests, ranker, and Workboard shard contracts.
- Embedding guard: pass; 5,076 files scanned, 1,333 route roots, 13 worker roots, zero new bypasses.
- Strict OpenSpec validation: pass for `parent-atlas-openspec-task-triage-pipeline`.
- `--incremental --dry-run` smoke: pass; no reports or canonical stores written.
- Scoped `git diff --check`: pass. A repository-wide check still reports pre-existing trailing whitespace in generated `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`; that file was not changed here.
- All reports and census files emitted for these lanes are below 10,000,000 bytes.

## Next safe gates

1. Resolve recipe and exact corpus/producer lineage for a bounded subset of live semantic_768 callers before migrating any caller.
2. Add only revision-bound task ranking features through the existing feature-matrix gate; neutral TaskCard ordering is not meaningful priority.
3. Complete the separate EvidenceCard-to-TaskCard association gate; do not reinterpret EvidenceCards as unmatched Workboard tasks.
4. Obtain a current graph-revision-bound snapshot and incidence rows before the HyperRAG cohort smoke; do not run Graphify as a substitute.
5. Keep incremental mode dry-run-only until a separately reviewed apply gate exists.

`writesPerformed:false`
