# Atlas Structural Index Integration Review v1

Date: 2026-08-24
Mode: read-only audit and bounded GPU fixture execution

## Proven in this pass

- cuGraph 26.06.00 exposes `jaccard`, `all_pairs_jaccard`,
  `spectralModularityMaximizationClustering`, `spectralBalancedCutClustering`, `leiden`,
  `louvain`, `sssp`, and `pagerank` in the WSL2 RAPIDS environment.
- A four-node cuGraph fixture executed Jaccard, PageRank, Louvain, and Leiden successfully.
- `atlas_ast_nodes` exists with 11,067 rows; all sampled rows have populated
  `qualified_symbol` values.
- `atlas_symbol_registry` exists with 10,220 rows, including 10,170 active rows.
- `atlas_observation_feature_rows` exists with 1,808 rows and populated AST, ontology, and
  evidence arrays; its current indexes are appropriate for a feature projection.

## Not proven or still missing

- `atlas_symbol_versions` now contains a bounded 100-row batch. Full corpus materialization is
  not yet complete, and canonical AST `tree_node_id` joins remain unresolved for that batch.
- `atlas_callable_search` now contains 100 indexed projection rows. Go retrieval still needs
  the complete projection and a proven `symbol_version_id -> tree_node_id -> packet_key ->
  CandidateOrdinal` join.
- Spectral modularity and Leiden have not passed the repository's CPU/GPU parity and repeat
  determinism gates. Jaccard was only exercised on a toy graph; no Graphify snapshot result
  was written.
- No new Neo4j, Postgres, Qdrant, Valkey, or source data was written in this pass.

## Additive migration applied

`sveltekit-frontend/drizzle/manual/20260824_atlas_callable_search_v1.sql` was applied on
2026-08-24. It added callable metadata columns to `atlas_symbol_versions`, created the
rebuildable `atlas_callable_search` projection, added B-tree/GIN indexes, and ran an
idempotent projection backfill. The backfill inserted `0` rows because the source table
currently contains `0` symbol versions. No existing rows were deleted or modified.

## Ownership decision to preserve

`atlas_ast_nodes` is the structural AST identity owner. `atlas_symbol_registry` is the stable
cross-revision symbol registry. `atlas_symbol_versions` is the revision-specific callable
record. `atlas_packet_features.ast_symbols` and `atlas_observation_feature_rows` are derived
retrieval features. A future `atlas_callable_search` object must be a rebuildable projection,
not a competing symbol registry.

## Recommended order

1. Resolve the source-ref/upstream-node mismatch so materialized versions can join
   `atlas_ast_nodes.tree_node_id` without treating upstream IDs as canonical.
2. Continue bounded declaration-like materialization and prove idempotency at each batch;
   then measure callable-search lookup against `rg` and AST reparse baselines.
3. Add the Go retrieval join through `symbol_version_id`, `tree_node_id`, `packet_key`, and
   `CandidateOrdinal` with revision checks.
4. Run Jaccard on a frozen Graphify snapshot for bounded similarity only; do not treat it as
   a community owner.
5. Keep spectral modularity primary for its diagnostic lane, Balanced Cut as a legacy
   challenger, Leiden as the persistent community candidate, and promotion blocked until
   parity/determinism receipts pass.

## External contract references

- OKF v0.2: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
- cuGraph spectral modularity API:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.spectralmodularitymaximizationclustering/
- cuGraph Jaccard API:
  https://docs.rapids.ai/api/cugraph/nightly/api_docs/api/cugraph/cugraph.jaccard/

likely_cause: The remaining integration gap is canonical AST tree-node alignment and complete revision-specific callable materialization, not missing GPU algorithms.
evidence: cugraph 26.06.00 bounded fixture; atlas_ast_nodes 11,067 rows; atlas_symbol_registry 10,220 rows with 10,170 active; atlas_symbol_versions 100 rows; atlas_callable_search 100 rows; tree_node_id join 0/100.
patch_targets: scripts/atlas/materialize-ast-symbol-versions.mjs; sveltekit-frontend/drizzle/manual/20260824_atlas_callable_search_v1.sql; openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md; docs/reports/atlas-structural-index-integration-v1.md
safe_next_command: npm --prefix sveltekit-frontend run atlas:features:ast-symbols:resolve:dry
smoke_command: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT count(*), count(*) FILTER (WHERE tree_node_id IS NOT NULL) FROM atlas_callable_search;"
report_path: docs/reports/atlas-structural-index-integration-v1.md
