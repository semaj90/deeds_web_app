## 1. Canonical trace_search join-back

- [x] 1.1 Read the active vector lane from the registry instead of hardcoding a legacy collection
- [x] 1.2 Join Qdrant trace hits to Postgres by canonical identity
- [x] 1.3 Return canonical content, summary, and lineage from Postgres-backed rows
- [x] 1.4 Preserve ANN ordering after join-back
- [x] 1.5 Fail closed on zero join coverage (`CANONICAL_JOIN_BACK_FAILED`)

## 2. Tool surface cleanup

- [x] 2.1 Update trace result mapping to use `source_ref`
- [x] 2.2 Keep `path` only as a legacy compatibility alias
- [x] 2.3 Bound the returned payload shape and content length

## 3. Verification

- [x] 3.1 Run a bounded `kb trace_search` invocation
- [x] 3.2 Confirm nonempty canonical Postgres content
- [x] 3.3 Confirm `source_ref` lineage is present
- [x] 3.4 Confirm bounded result count
- [x] 3.5 Record proof status in the change (see status block below)

## GDS 1. Neo4j environment + canonical port repair

- [x] GDS1.1 Fix Neo4j env wiring (`NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD` in `env.server.ts`, Zod fail-loud at MCP startup)
- [x] GDS1.2 Replace raw-HTTP `neo4jQuery()` with bolt-driver `getNeo4jDriver()`; fix integer-vs-float Cypher param bug
- [x] GDS1.3 Extract `GraphAnalyticsPort` (`graph-analytics-service.ts`) + low-level client (`neo4j-gds-client.ts`) + bounded retrieval facade (`graph-retrieval-adapter.ts`)
- [x] GDS1.4 Migrate `neo4j-gds.ts`'s 4 live-consumer exports (`ensureGdsProjection`, `runPageRankMutate`, `getTopAuthorityNodes`, `getImpactNeighborhood`) to thin delegating wrappers, exact signatures preserved
- [x] GDS1.5 Repair partial-extraction defects (2 duplicate JSDoc blocks) found on re-inspection
- [x] GDS1.6 Static + unit characterization tests (`tests/neo4j-gds-wrapper-characterization.spec.ts`, 19 tests) — locks signatures, return-field names, and asserts no embedded query body/duplicate JSDoc in any wrapper
- [x] GDS1.7 Re-verify caller counts: `neo4j-gds.ts` 4 real consumers; `neo4j-gds-orchestrator.ts` and `db/neo4j-gds-retrieval.ts` both 0 consumers (flagged `DEAD_OR_UNREFERENCED`, untouched)
- [ ] GDS1.8 Bounded breadth-first search tool (`BreadthFirstSearchRequest`/`Result`, APOC + pure-Cypher fallback, label/rel-type allowlists) — NOT STARTED
- [ ] GDS1.9 Revisioned named projection design (`atlas_code_graph__<workspace>__<revision>`) — NOT STARTED, current `codeTopology` remains `LEGACY_UNVERSIONED_PROJECTION_NAME`
- [ ] GDS1.10 Real persisted, distribution-verified PageRank run — NOT STARTED (`runPageRank` is callable but no distribution/persistence proof yet)

## WS 1. Workstation smoke + end-to-end path repair

- [x] WS1.1 Fix stale `codebase_chunks_384` test expectations in `tests/parent-atlas-workstation.spec.ts` (`atlas:qdrant:repair`, `atlas:qdrant:repair:preflight`) to match live `package.json` `codebase_chunks_768`; added `not.toContain('384')` regression guards — 4/4 tests pass
- [x] WS1.2 Fix duplicated-path bug in `scripts/atlas/parent-atlas-workstation-end-to-end.mjs` line 74: `path.join(WORKSPACE, 'sveltekit-frontend', 'scripts', 'atlas', 'backfill-feature-metadata.mjs')` doubled the `sveltekit-frontend` segment (`WORKSPACE` is already `REPO_ROOT/sveltekit-frontend`); fixed + added `assertScriptExists()` fail-loud gate
- [x] WS1.3 Re-ran `node scripts/atlas/parent-atlas-workstation-end-to-end.mjs` from repo root — path fix confirmed live: `featureMetadata` lane now executes (previously failed before reaching the script at all). Surfaced two further pre-existing bugs in `backfill-feature-metadata.mjs` (not part of the original two reported failures), both fixed in this pass:
  - `nes_chrom_packets` in `TIER_1_TABLES` referenced a table that does not exist live (`information_schema.tables` confirms absence) — removed from the tier list, same failure class as the documented `atlas_higher_hop_index`/`atlas_codebase_packets`/`atlas_feature_packets` precedent in project `CLAUDE.md` (stale reference removed, no table created)
  - `glyph_records` column map claimed a `source_ref` column; live schema (`\d glyph_records`) has no `source_ref`/`feature_id` at all, only `source_id` — corrected the map to `source_id`
  - Final run: `featureMetadata: PASS`; full pipeline result `WARN` (not `FAIL`) — the two WARN notes (`qdrantComponentParity` coverage, sampled packet coverage <95%) are pre-existing gaps unrelated to this fix, not new regressions
- [ ] WS1.4 Resolve `atlas_packets` (61,659) vs `atlas_packet_registry` (58,324) parity gap — 3,335 rows missing registry entries; blocks canonical-spine completion claim — NOT STARTED
- [ ] WS1.5 Report both join-coverage metrics for summary-promotion batches (coverage among joined rows vs. coverage among all usable candidates — e.g. a batch reporting "100% join coverage" among 18 joined rows out of 97 usable candidates is really ~18.6% corpus coverage, not 100%) — NOT STARTED
- [ ] WS1.6 Investigate `qdrantComponentParity` WARN: `missing_points: 50` (all `codebase_chunks_384_v2` sample) — undefined repair-path row fields in the audit script output (`undefined  undefined` printed instead of file/id) suggest a payload field-name mismatch in `qdrant-parity-repair.mjs`'s reporting path — NOT STARTED, found during WS1.3 re-run, not yet triaged

## GRAPH-SNAPSHOT 1. Full-corpus snapshot materialization (consolidated plan item #1)

- [x] GS1.1 Locate existing fixture-proven pure function `materializeGraphSnapshot()` (`src/lib/server/atlas/graph/graph-snapshot-materializer.ts`) — no need to build from scratch
- [x] GS1.2 Verify live target tables exist (`atlas_graph_snapshots_v2`/`nodes_v2`/`edges_v2`/`snapshot_exclusions_v2`) and `atlas_packets`↔`atlas_tree_nodes` join coverage (94.6%, 58,304/61,659)
- [x] GS1.3 Write full-corpus driver script `scripts/atlas/materialize-full-corpus-graph-snapshot.mts` (`--dry-run`/`--verify`/`--apply`); fixed a real bug (missing required `provenance` column in edges INSERT) before running
- [x] GS1.4 Dry-run #1 against live corpus: succeeded, self-verified (`replayMatches: true`), but found `TREE_NODE_TYPE_MAP` excluded ~150,010 real AST-level nodes (`function_declaration`, `interface_declaration`, `arrow_function`, `type_alias`, `class_declaration`, `struct_declaration`) because the map only recognized coarse doc/page/section/chunk types
- [x] GS1.5 Fixed: extended `TREE_NODE_TYPE_MAP` to map all 6 AST node types to the existing `'symbol'` node type; re-ran materializer's own unit test (2/2 pass)
- [x] GS1.6 Dry-run #2/#3 (post-fix): found a second real bug during re-run — `topologyHash()`'s `stableJson` built one giant JS string via nested `Array.join`, which threw `RangeError: Invalid string length` once the corrected type map pushed node count to 321,567 (was previously crashing silently below that threshold at ~175K). Fixed in `src/lib/server/atlas/graph/graph-snapshot.ts`: `topologyHash` now streams each sorted node/edge into `createHash('sha256').update()` incrementally instead of materializing one document string — byte-identical input to sha256, so digests are unchanged for any input that doesn't crash (confirmed via existing `graph-snapshot-identity.spec.ts` + `graph-snapshot-materializer.spec.ts`, 6/6 pass). Re-ran dry-run: `nodeCount: 321567`, `edgeCount: 116608`, `excludedNodeCount: 3355` (down from 150,010), internal `replayMatches: true`
- [x] GS1.7 `--verify` (two independent top-level `materializeGraphSnapshot()` calls, no DB writes): `Hash stability across two runs: PASS`
- [x] GS1.7b Fixed a real byte-compatibility bug in the streamed `topologyHash` found during a required-by-user regression pass: `stableJson` sorts ALL object keys alphabetically including the top-level `{nodes, edges}` envelope (`"edges" < "nodes"`), so the legacy monolithic hash emits edges first — my streamed version had hardcoded nodes-first. Fixed the envelope order in `graph-snapshot.ts`. Added 3 required regression tests to `graph-snapshot-identity.spec.ts`: legacy byte-for-byte compatibility (`legacyTopologyHash` reference impl vs streamed `topologyHash`), ordering independence, nested property-key-order determinism — all pass (9/9 total in the two spec files)
- [x] GS1.8 `--apply` attempted twice; BOTH rolled back cleanly, nothing persisted (confirmed via `SELECT count(*) FROM atlas_graph_snapshots_v2` = 0 after each attempt):
  - Attempt 1: crashed with `RangeError: Invalid string length` mid-run — this was the pre-fix code (script had been independently upgraded on disk between my `--verify` and this `--apply`, to a materially better version with git-derived `workspaceRevision`/`sourceQueryHash`, schema-aware column projection, and a `buildReport()` shape that already matches every field this OpenSpec change asked to record — not tampering, a legitimate concurrent improvement)
  - Attempt 2 (retried with `NODE_OPTIONS=--max-old-space-size=6144`, ruling out OOM as attempt 1's cause): passed its own internal hash-stability check (`PASS`, both runs `topologyHash: 9ee02a99...`), then failed on a REAL, distinct bug during the actual DB insert: `duplicate key value violates unique constraint "atlas_graph_nodes_v2_tree_node_unique"` — `UNIQUE(snapshot_id, tree_node_id) WHERE tree_node_id IS NOT NULL`
- [x] GS1.9 Root-caused the constraint violation — **this is a design/identity-model gap, not a mechanical bug**, per explicit user redirection (do not patch either side yet):
  - `materializeGraphSnapshot()` deliberately creates TWO graph nodes sharing one `tree_node_id`: the tree/symbol node itself (`materializedFrom: 'atlas_tree_nodes'`) and its owning packet's node (`materializedFrom: 'atlas_packets'`, `treeNodeId: packet.treeNodeId`) — confirmed at `graph-snapshot-materializer.ts:218-356`. This is the common case, not an edge case: 321,567 total nodes from 263,263 tree nodes + 61,659 packets, only 3,355 excluded — virtually every resolved packet collides with its owning tree node under the current 1-node-per-tree-node constraint
  - Deeper finding while inventorying per user request: `atlas_tree_nodes.node_id` (populated by `scripts/atlas/batch-a-structural-materializer.mts`, the source of the 6 newly-mapped AST types) is actually a **content-version identity** (`uuidv5(sha256(nodeText+filePath+symbolPath))`), not a stable symbol identity — the script computes a genuinely stable `treeNodeId = uuidv5(filePath:symbolPath:kind)` at line 216 but **never uses it**, only the content-hash-derived `treeNodeVersionId` is persisted as `node_id`. So "tree_node_id" today conflates occurrence/version identity with what should be stable symbol identity — exactly the gap the user's redirection named
  - Also confirmed: `batch-a-structural-materializer.mts` extracts functions/classes via **regex heuristics** per language, not real parsing, despite the graph snapshot manifest claiming `"parserContractVersion": "tree-sitter-typescript-v1"` (a misleading claim in the manifest). A separate, better script (`scripts/atlas/ast-treesitter-facts.mjs`) already uses real `web-tree-sitter` + `.wasm` grammars — not yet wired as the source for `atlas_tree_nodes` AST-level rows
  - Inventory of adjacent layers (requested by user, all read-only checks, no writes):
    - Domain classification: `atlas_packets.domain_class` 100% populated (61,659/61,659)
    - Concept extraction: **0 rows** across all 3 concept tables (`concept_records`, `atlas_concepts`, `atlas_ontology_concepts`) — not started
    - Community assignment: `atlas_packets.community_id` 100% populated (61,659/61,659); `atlas_tree_nodes.community_id`/`som_cluster` **0/263,263** — unpopulated at tree-node granularity
    - KMeans clustering: `atlas_packets.cluster_id` **0/61,659** — not run/persisted
    - semantic_768 embeddings: `atlas_packets.vectors` JSONB is a pointer/metadata envelope (`vector_dim`, `qdrant_point_id`, `qdrant_collection`, `embedding_768_idempotency`), not the raw vector — real vectors live in Qdrant `codebase_chunks_768` (established canonical mirror per project CLAUDE.md); did not re-verify point-count parity this pass
    - KNN/top-k retrieval: NOT absent — `topK`/`knnSearch` implementations exist in `atlas-semantic-tools.ts`, `search-runtime-adapter.ts`, `cuvs-sidecar-client.ts`, `go-retrieval-retriever.ts`, etc. — exists as retrieval-lane code, not yet proven wired to a canonical/stable symbol identity
    - PageRank/authority persistence: v1 tables have data (`atlas_graph_authority_runs`: 1 row, `atlas_graph_authority_scores`: 50,164 rows); the `_v2` tables (paired with `atlas_graph_snapshots_v2`) are **empty** — never run, since no v2 snapshot has ever successfully applied
    - 20×20 SOM: no dedicated `som_x`/`som_y`-driven 20×20 grid pipeline found this pass beyond the existing `som_x`/`som_y` columns on `atlas_tree_nodes` (both 0% populated per above)
- [ ] GS1.10 Per explicit user instruction: **do NOT** relax `atlas_graph_nodes_v2_tree_node_unique`, **do NOT** strip `treeNodeId` from packet nodes, **do NOT** re-attempt `--apply` until a separate identity-model design pass distinguishes `parse_node_id` (revision-bound occurrence) / `symbol_id` (stable cross-revision identity) / `chunk_id` / `packet_key` / `concept_id` / `graph_node_key` instead of overloading `tree_node_id` for all of them — NOT STARTED, blocked pending that design decision
- [ ] GS1.11 Reclassify this artifact's status language: the current `--dry-run`/`--verify` PASS proves the materializer can deterministically produce a large structural artifact from `atlas_tree_nodes` + `atlas_packets` as they exist today — it does NOT prove `tree_node_id` is canonical symbol identity, that symbols reconcile across reparses, that domains/concepts are complete, or that KNN/KMeans/SOM/PageRank are current. Use `PROVISIONAL_STRUCTURAL_GRAPH_SNAPSHOT: DRY_RUN_PASS` / `CANONICAL_GRAPH_SNAPSHOT: NOT_PROVEN` / `GRAPH_SNAPSHOT_APPLY: ROLLED_BACK` / `TREE_NODE_UNIQUENESS_CHANGE: BLOCKED` rather than promoting `FULL_CORPUS_GRAPH_SNAPSHOT` to PASS
