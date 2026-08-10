> **Cross-reference (2026-08-10)**: the canonical packet→chunk→topology tree-link gate
> (`atlas_topology_index`, `scripts/atlas/backfill-topology-index.mjs`, idempotency proof) is
> tracked in the **root** `openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md`'s
> `TOPOLOGY-GATE (2026-08-10)` section, not here — this repo has two separate OpenSpec roots with
> a same-named change folder (see the root file's own `GS1.23` finding, which documents this
> exact collision). Not duplicated here to avoid deepening that ambiguity.

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
- [ ] GS1.12 Design guidance captured for the GS1.10 identity-model pass (not yet implemented — design input only): use **lineage edges instead of ID reuse** to resolve the `tree_node_id` collision. Rather than a packet node and its tree/symbol node sharing one `tree_node_id` value (today's approach, which the DB constraint correctly rejected), give each layer its own identity and connect them with typed `DERIVED_FROM`/`REPRESENTS`/etc. edges:
  ```
  Packet v42 --DERIVED_FROM--> TreeNode 1234
  Packet v43 --DERIVED_FROM--> TreeNode 8127
  ```
  This preserves history across re-parses (when a function body changes, its `tree_node_id`/`treeNodeVersionId` changes too — see GS1.9 — but the packet's logical identity doesn't have to) and avoids the current either-or choice between relaxing the DB constraint or discarding provenance. Proposed small, fixed lineage-edge vocabulary (avoids re-overloading a single relation type the way `tree_node_id` got overloaded):
  | Edge | Meaning |
  |---|---|
  | `DERIVED_FROM` | Produced from another artifact (packet ← AST/tree node) |
  | `REPRESENTS` | Semantic representation of an artifact (embedding → packet) |
  | `PROJECTS_TO` | Materialized into another storage/index (graph projection → packet) |
  | `SUMMARIZES` | Higher-level abstraction (summary → packet) |
  | `REFERENCES` | Mentions/cites another artifact (recommendation → packet) |
  | `SUPERSEDES` | Replaces an earlier revision |
  | `GENERATED_BY` | Produced by a specific pipeline/tool run |
  | `VALIDATED_BY` | Verified by a proof/audit step (observation → packet) |
  Maps cleanly onto the layered identity chain from GS1.10 (`tree_node_id → packet_key → representation_id → embedding_revision`), with Postgres staying canonical truth and Neo4j/Qdrant/Redis as projections over it — consistent with the project's existing Postgres-truth/mirrors architecture rule. This is a proposal to fold into the GS1.10 design pass, not something to implement yet.

## DEEP-AUDIT 1. Scoped code-quality gate sweep (this session's touched files)

- [x] DA1.1 Ran `/deep-audit` scoped to the 7 files touched by GS1.x work (not full-repo — cached `codebase-graph.json` was ~29 days stale; user chose to regenerate it via `npm run graphify:daily` rather than audit on stale data or skip regen, regen ran independently/concurrently and is tracked separately, not gating this result)
- [x] DA1.2 G1 (import consumers): `graph-snapshot.ts` has exactly 1 real consumer (`graph-snapshot-materializer.ts:11`, imports `topologyHash` + types) — no orphan risk from the `topologyHash` streaming rewrite
- [x] DA1.3 G8 (TODO/FIXME markers): 0 across all 7 touched files
- [x] DA1.4 G16 (test pairing): `graph-snapshot.ts`/`graph-snapshot-materializer.ts` both paired (`graph-snapshot-identity.spec.ts`, `graph-snapshot-materializer.spec.ts`, 9/9 passing); the 5 CLI driver scripts have no paired specs, consistent with existing repo convention for `scripts/atlas/*` operational scripts — not a gap introduced this session
- [x] DA1.5 Structural check (duplicate JSDoc, unreachable code): 0 findings in the rewritten `topologyHash`/edited files
- **Recap**: 7 files audited, 0 hard fails, 0 warnings — nothing new to remediate from GS1.x changes

## CORRECTION (2026-08-10) — both `--apply` snapshots existed live, contradicting GS1.8/GS1.10/GS1.11

GS1.8 above records "`--apply` attempted twice; BOTH rolled back cleanly, nothing persisted
(confirmed via `SELECT count(*) FROM atlas_graph_snapshots_v2` = 0 after each attempt)", and
GS1.10/GS1.11 explicitly block re-attempting `--apply` pending the `tree_node_id` identity-model
redesign. A separate session (tracked in `parent-atlas-graph-analysis-contract/tasks.md`'s deep
tree-lineage audit) found **two `VALIDATED` rows already live** in `atlas_graph_snapshots_v2`
(`58d9da79...`, 2026-08-02, 321,567 nodes; `382c8dc6...`, 2026-08-09, 162,234 nodes) — postdating
this file's own "blocked, do not re-attempt" instruction. Not resolved here whether that was an
unauthorized/unaware re-run or this file's GS1.8 entry was simply never updated after a later
successful attempt — flagged for whoever picks up GS1.10, not investigated further this pass.

**Separately, and more urgently**: both live snapshots were built while
`graph-snapshot-materializer.ts` had a real gap — `TREE_NODE_TYPE_MAP` (widened at GS1.5)
determined node *inclusion* by `nodeType` membership alone; `ledgerType` was threaded into node
properties but never actually gated inclusion, despite the manifest's own
`eligibility_predicate` field claiming *"canonical tree_node_id + packet_key resolution"*. This
let 146,655 rows from `scripts/atlas/batch-a-structural-materializer.mts` — a regex/heuristic
extractor with approximate 100-char-window boundaries, zero real parent/child edges, that omitted
`ledger_type` from its INSERT and so silently inherited the column default `'canonical'` — into
both snapshots as `'symbol'` nodes, at full canonical trust.

**Fixed this pass** (live-verified):
1. `graph-snapshot-materializer.ts` — added an explicit `ledgerType !== 'canonical'` exclusion
   gate (`NON_CANONICAL_LEDGER_TYPE` reason) immediately after the existing `nodeType` check, so
   the eligibility predicate's own claim is now actually enforced.
2. `batch-a-structural-materializer.mts` — now writes `ledger_type: 'synthetic'` explicitly
   instead of omitting the column.
3. Live `atlas_tree_nodes` data corrected: `UPDATE ... SET ledger_type = 'synthetic' WHERE
   node_type IN (arrow_function, class_declaration, function_declaration,
   interface_declaration, struct_declaration, type_alias) AND ledger_type = 'canonical'` —
   exactly 146,655 rows updated, verified before/after; `document`/`chunk` rows (58,304 each)
   confirmed untouched.
4. Both existing `atlas_graph_snapshots_v2` rows flipped `VALIDATED` → `SUPERSEDED` (status
   column already supports this per its check constraint) — they were built before the fix above
   and still contain the 146,655 contaminated `'symbol'` nodes baked in; their `VALIDATED` status
   and `eligibility_predicate` claim were both false relative to what actually ran.

**Not done, deliberately**: no `--apply` re-run to produce a fresh, clean snapshot. GS1.10's
`tree_node_id` collision blocker is independent of the contamination fixed here and remains
unresolved — regenerating now would still hit that same open design question. No downstream
consumer of `atlas_graph_nodes_v2`/`atlas_graph_edges_v2` was found this pass (searched
`src/`, `scripts/`, `packages/` for readers beyond the writer itself and its own Drizzle schema
declaration), so there is no urgency forcing a fresh snapshot before GS1.10 resumes. When GS1.10
is picked up, regenerate a snapshot as part of that work rather than treating this fix as
sufficient on its own — the identity-model gap and the trust-tier gap are two separate problems
that happened to compound in the same two rows.

## HARDENING PASS (2026-08-10, same day, later) — provenance-aware admission, not just a ledger check

Per explicit downstream-consumer-audit-first direction: confirmed before touching anything that
no live reader exists for `atlas_graph_nodes_v2`/`atlas_graph_edges_v2` (application routes: 0;
the one candidate consumer, `graph-snapshot-postgres.ts`, has 0 callers outside its own spec;
Batch B/C/D pipeline scripts structurally exclude the heuristic rows via an unrelated
`feature_id IS NOT NULL` filter, not by design). Classified as `ORPHANED_EXPERIMENTAL_PROJECTION`
sitting at `MISLABELED_CANONICAL` trust, not an active retrieval/ranking incident — but the
original same-day fix (a bare `ledgerType !== 'canonical'` check) was flagged as trap-prone: it
depends entirely on every future writer remembering to set `ledger_type` correctly, with no
independent, checkable signal if one doesn't. Hardened to a positive, provenance-aware admission
contract instead of a single-flag gate:

1. **`batch-a-structural-materializer.mts` self-declares what it actually is**, in `metadata`
   rather than relying on `ledger_type` alone: `producerId: 'batch-a-structural-materializer'`,
   `producerRevision` (parser version), `extractionMethod: 'regex_heuristic'`,
   `structuralTruth: false`, `boundaryPrecision: 'approximate'`, `hierarchyProven: false`. No new
   trust vocabulary invented — `ledger_type` stays `'synthetic'` (already-registered value; see
   prior correction section).
2. **`graph-snapshot-materializer.ts`** — added `classifyCanonicalGraphEligibility()`, a positive
   admission contract with two proven families instead of one flag check:
   - `packet_hierarchy` (document/page/section/subsection/chunk): requires
     `ledger_type='canonical'` AND `metadata.source === 'atlas_packets'`.
   - `ast_symbol` (function/class/interface/type-alias/struct/arrow_function): requires
     `ledger_type='canonical'` AND `metadata.extractionMethod === 'tree_sitter'` AND
     `metadata.structuralTruth === true`, AND explicitly rejects
     `metadata.producerId === 'batch-a-structural-materializer'` even if some future bug lets it
     through with `ledger_type='canonical'` again. Anything not proving membership in either
     family is rejected — unknown provenance is never interpreted as trustworthy provenance
     (verified by a dedicated regression test: a symbol node with empty `metadata` is rejected
     `STRUCTURAL_TRUTH_NOT_PROVEN`, not silently admitted).
3. **`TREE_NODE_TYPE_MAP` demoted to representation-only** (comment added) — it answers "what
   graph node kind would this become," never "is this trustworthy." This is the direct fix for
   the GS1.5 failure mode ("extend the map so more rows survive" widened recognition without
   adding a trust check).
4. **`eligibility_predicate` column now holds the real, executable contract** (JSON-stringified:
   the two families' exact requirements + `default: 'reject'`) instead of a prose claim
   ("canonical tree_node_id + packet_key resolution") that wasn't enforced when it was written.
5. **Rejection telemetry added**: `GraphSnapshotProof.rejectionCounts` — every
   `node_materialization` exclusion reason mapped to its count for the run, so contamination is
   visible as a number instead of disappearing from `nodeCount` with no trace.
6. **6-case regression matrix added** to `graph-snapshot-materializer.spec.ts` (16/16 tests
   passing, live-run): canonical packet document → ADMIT; canonical packet chunk → ADMIT;
   canonical real tree-sitter symbol with `structuralTruth: true` → ADMIT; Batch A heuristic
   symbol even with `ledger_type='canonical'` → REJECT `HEURISTIC_AST_PROJECTION` (proves the
   producerId check catches it independently of the ledger flag); Batch A symbol correctly tagged
   `synthetic` → REJECT `NON_CANONICAL_LEDGER_TYPE`; symbol with empty/unknown metadata → REJECT
   `STRUCTURAL_TRUTH_NOT_PROVEN` (fail-closed on unknown provenance); untrusted
   packet-hierarchy source (`metadata.source` not `'atlas_packets'`) even with canonical ledger →
   REJECT `UNTRUSTED_PACKET_HIERARCHY_SOURCE`.
7. **Live dry-run against the full corpus, post-fix** (`npx tsx
   scripts/atlas/materialize-full-corpus-graph-snapshot.mts --dry-run`, no apply):
   `rejectionCounts: { NON_CANONICAL_LEDGER_TYPE: 146655 }` — exactly the corrected row count from
   the earlier pass, all caught (via `ledger_type`, since those live rows were already corrected
   to `'synthetic'` earlier the same day; the independent `producerId`/`structuralTruth` checks in
   `classifyCanonicalGraphEligibility` are the defense against this regressing silently in the
   future). `persistedNodeCount: 184976` (down from `eligibleNodeCount: 331631` pre-filter, i.e.
   down from the old contaminated ~331K), `edgeCount: 123318`, `replayMatches: true` (determinism
   holds under the new logic). **No `--apply` run** — dry-run only, nothing persisted, consistent
   with GS1.10 remaining the open blocker for producing a fresh canonical snapshot.
8. **The two existing `atlas_graph_snapshots_v2` rows were left as `SUPERSEDED`** (set in the
   prior same-day pass, using the table's own pre-existing `status` check-constraint value — not
   an invented trust label, and not a delete). Preserved as forensic evidence of what the
   contaminated state looked like, per explicit instruction not to destructively rewrite them
   without a documented status mechanism.

**Three distinct failures, not one**, per explicit classification:
- **Producer classification failure**: `batch-a-structural-materializer.mts` is a regex/heuristic
  experiment that was never classified as such in its own output — it self-identified as
  indistinguishable from canonical data.
- **Trust-boundary conflation failure**: `graph-snapshot-materializer.ts`'s `TREE_NODE_TYPE_MAP`
  widening (GS1.5) let "recognized node type" stand in for "trustworthy node," with the
  eligibility predicate advertising an enforcement that didn't exist.
- **Process/governance failure**: two `--apply` runs persisted live snapshots after this file's
  own GS1.10/GS1.11 explicitly recorded the apply path as blocked pending an unresolved
  identity-model design pass — a documented block that live state did not honor, for reasons not
  established this pass.

**GS1 LIVE STATE CORRECTION (2026-08-10)**: `FULL_CORPUS_GRAPH_SNAPSHOT: EXISTS,
NOT_PROMOTED, PROVENANCE_INVALIDATED` — an applied artifact existing does not override the
earlier promotion block (GS1.11's `CANONICAL_GRAPH_SNAPSHOT: NOT_PROVEN` stands). No downstream
Neo4j/GDS/retrieval consumer has been found as of this audit. The trust-boundary and producer-
classification failures above are now closed (positive admission contract, tested, dry-run
proven). The process/governance failure and GS1.10's identity-model design gap remain open and
unrelated to this pass's fix — do not treat this hardening as clearing GS1.10.

## Repository-first search inventory

The following owner surfaces were located during the repo-first search pass. These are discovery results only; they do not prove runtime behavior.

- [x] Diff context / patch context: `scripts/ace-diff-sniffer.mjs`, `sveltekit-frontend/src/lib/server/atlas/context-for-file.ts`, `sveltekit-frontend/src/mcp/trace-mcp-server.ts` — wrapper runtime proof added in `tests/routes/auto/api/ace/recommendations.test.ts`
- [ ] Recommendation record / supersession: `sveltekit-frontend/src/lib/server/ace/recommendation-record.ts`, `sveltekit-frontend/src/lib/server/mcp/phase109a-mcp-tools.ts`, `sveltekit-frontend/src/lib/server/retrieval/feature-record.ts`, `sveltekit-frontend/src/lib/server/retrieval/promote-results-outbox.ts`
- [ ] Validation receipts / proof gates: `sveltekit-frontend/src/lib/server/atlas/contracts/validation-result-v1.ts`, `sveltekit-frontend/src/lib/server/agent/execution-review.ts`, `scripts/opencode/validation-gate.mjs`
- [ ] Hot / warm / cold storage: `sveltekit-frontend/src/mcp/engram_tools.ts`, `sveltekit-frontend/src/lib/server/cache/*`, `sveltekit-frontend/src/lib/server/retrieval/*`
- [ ] Tensor / gRPC / protobuf: `sveltekit-frontend/src/lib/server/atlas/go-retrieval-grpc-client.ts`, `sveltekit-frontend/src/mcp/server.ts`, `sveltekit-frontend/src/lib/server/atlas/atlas-semantic-tools.ts`
- [ ] SOM / KMeans / topology: `sveltekit-frontend/src/mcp/server.ts`, `sveltekit-frontend/src/lib/server/atlas/atlas_embedding_tools.ts`, `scripts/agents/som-cluster-cards.mjs`
- [ ] NLP / LDR sidecar: `sveltekit-frontend/src/mcp/trace-mcp-server.ts`, `sveltekit-frontend/src/mcp/ldr-research-tools.ts`
- [ ] Graph retrieval / projection: `sveltekit-frontend/src/lib/server/retrieval/*`, `sveltekit-frontend/src/lib/server/atlas/graph/*`, `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board.ts`

### Next bounded search step

- [ ] Reuse the located owner file for each surface instead of creating a parallel implementation.
- [ ] Confirm the runtime entrypoint for each owner before any patch.
- [ ] Add tests at the owner boundary before wiring new code paths.
- [ ] Record runtime proof separately from static discovery.
