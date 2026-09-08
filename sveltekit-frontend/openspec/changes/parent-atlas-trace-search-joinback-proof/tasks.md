> **Cross-reference (2026-08-10, updated 2026-09-06)**: the canonical packet→chunk→topology
> tree-link gate (`atlas_topology_index`, `scripts/atlas/backfill-topology-index.mjs`, idempotency
> proof) is tracked in the **root** `openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md`'s
> `TOPOLOGY-GATE (2026-08-10)` section, not here.
>
> **Resolved 2026-09-06**: the same-named-folder collision this note originally flagged (see the
> root file's own `GS1.23` finding, which first documented it on 2026-08-10) has been fixed — this
> folder was renamed from `parent-atlas-graph-retrieval-proof` to
> `parent-atlas-trace-search-joinback-proof`, matching what it actually covers (the `trace_search`
> Qdrant→Postgres join-back proof, not the root file's `tree_node_id` graph-identity lineage work).
> The two changes were never duplicates of each other — they addressed genuinely different
> problems that happened to share a name — so this was a rename, not a merge. No content was
> changed beyond this note and the directory path.

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
- [x] GDS1.8 Bounded breadth-first search tool (`BreadthFirstSearchRequest`/`Result`, APOC + pure-Cypher fallback, label/rel-type allowlists) — **DONE 2026-09-08**. Added
      `breadthFirstSearchClient()` to `neo4j-gds-client.ts` (same layer/lifecycle pattern as
      the sibling `expandGraphClient`, which it does not replace — distinct in that it adds
      `nodeLabelAllowlist`/`relationshipTypeAllowlist` filtering, true BFS-ordered traversal
      (`bfs: true` on the APOC path), and reports back which requested allowlist entries don't
      exist live (`ignoredRelationshipTypes`/`ignoredNodeLabels`) instead of erroring). Wired as
      `GraphAnalyticsPort.breadthFirstSearch()` in `graph-analytics-service.ts` — deliberately did
      **not** touch `atlas-tool-registry.ts`'s separate `expandGraph` (backed by a different file,
      `graph-expansion-adapter.ts`) since that's a distinct, already-tangled stack outside this
      task's scope; adding a third path there risked creating exactly the kind of duplicate-owner
      confusion this repo's CLAUDE.md warns against.
      **Real finding surfaced while building the live proof, not fixed here (pre-existing, shared
      with `expandGraphClient`)**: production Neo4j data does **not** populate `stableKey` on real
      nodes — `MATCH (n) WHERE n.stableKey IS NOT NULL RETURN count(n)` = 2 live, both stray
      leftover rows from an earlier session's proof, not real content. Real `CodebaseFile`/
      `ParentAtlasSource` nodes use `path`/`sourceRef`/`featureId` for identity instead (confirmed
      via `keys(n)` on live nodes). This means the existing `expandGraphClient`'s (and now this new
      function's) `{stableKey: $stableKey}` seed match cannot resolve a real production node today
      — both are functionally BFS-correct but effectively unreachable against live data until this
      identity-key mismatch is resolved, which is a separate decision (changing an already-shipped
      function's seed-key contract), not part of this task. **Live proof, used an isolated fixture
      instead of the 2 stray real rows** (to avoid a false-positive "proof" against leftover data):
      `neo4j-gds-client-bfs.integration.spec.ts` (`RUN_DB_INTEGRATION=1`) creates its own small
      subgraph (`bfs-proof-2026-09-08:*` stableKeys), proves BFS ordering + both allowlists +
      unknown-allowlist reporting (4/4 tests pass against real Neo4j/APOC), then deletes the
      fixture in `afterAll` — confirmed zero footprint afterward via a direct `cypher-shell` count.
- [x] GDS1.9 Revisioned named projection design (`atlas_code_graph__<workspace>__<revision>`) — **DONE 2026-09-08, design/naming layer only, deliberately not wired as a new default**.
      Found substantial pre-existing infrastructure for this (`GraphProjectionManifestSchema`,
      `computeRelationshipProjectionHash`, `assertGraphProjectionFreshness` in
      `graph-projection-manifest.ts`, from an earlier "Patch A" pass) — the schema/hash/freshness
      machinery already existed, but nothing actually computed a revisioned *name* in the
      `atlas_code_graph__<workspace>__<revision>` shape this task asked for, and `codeTopology`
      remained the sole hardcoded projection name every production caller
      (`pagerank-analysis-adapter.ts`, `kcore-analysis-adapter.ts`, `betweenness-analysis-adapter.ts`,
      `cheirank-analysis-adapter.ts`, `graph-analysis-runner.ts`) still uses. Added 2 pure,
      additive functions to `graph-projection-manifest.ts`: `buildRevisionedProjectionName(workspace,
      graphRevision)` (sanitizes both inputs to `[A-Za-z0-9_]`, throws if either has zero
      alphanumeric content — caught a real bug in my own first draft during test-writing: an
      all-punctuation input like `'///'` sanitized to `'___'`, which is non-empty but semantically
      garbage, so the guard was widened from "reject empty" to "reject no alphanumeric content")
      and `buildProjectionManifest(...)` (assembles a schema-valid `GraphProjectionManifest` from
      an `ensureProjectionClient()` result). **Deliberately scoped as additive-only, matching
      GS1.10's own precedent elsewhere in this file for reserving identity/versioning redesigns of
      a live canonical construct for a human decision rather than an agent unilaterally picking
      one**: no production caller's default projection name is changed by this, and no persistence
      layer for the manifest was built (its own docstring already noted zero live persisters
      before this change, and still notes it after — deciding where a manifest should be durably
      stored, e.g. a new Postgres table, and when/how production callers should migrate off
      `codeTopology`, are separate, larger decisions left open). 8/8 unit tests pass
      (`graph-projection-manifest.spec.ts`, 4 new: naming shape, sanitization, the caught
      empty-content bug, determinism; plus 1 new manifest-assembly test) — pure functions, no DB
      needed for proof.
- [x] GDS1.10 Real persisted, distribution-verified PageRank run — **CORRECTED 2026-09-08: this
      claim was stale, not actually true.** Checked live Neo4j directly rather than trusting the
      "NOT STARTED" note: `MATCH (n) WHERE n.pageRankScore IS NOT NULL RETURN count(n)` = **356,445
      real nodes**, with a real, non-degenerate PageRank distribution (`min=0.15` — matches GDS
      PageRank's `(1-dampingFactor)` floor exactly, `p50=0.15`, `p90=0.96`, `p99=1.40`,
      `max=1059.16` — a healthy power-law tail with a handful of extreme-authority hub nodes, not
      flat/constant/zero). **Deliberately did not re-run PageRank against production** to "prove"
      this task — the data already demonstrates a real persisted run, and re-triggering
      `runPageRankMutate` against the live `codeTopology` projection risks overwriting scores
      currently read by real production consumers for no benefit (this repo's GS1 section above
      has an explicit prior incident where an unauthorized `--apply` re-run silently persisted
      contaminated data — re-running write-mutating GDS algorithms against production without a
      clear reason is exactly the pattern to avoid, not repeat). Confirmed `pageRankScore` is
      genuinely read by production code, not just referenced in a docstring claim: 59 real files
      import/reference it (`context-assembler.ts`, `mutation-gate.ts`, `authority-scorer-unified.ts`,
      `hyperrag-fusion-service.ts`, `search-runtime.ts`, and 54 more — grep-verified, not assumed).
      **This task's "NOT STARTED" status was simply wrong** — whoever wrote it either didn't check
      live Neo4j or the run happened after this file was last touched; either way, the real state
      is PageRank has been run, persisted, and is actively load-bearing in production today.

## WS 1. Workstation smoke + end-to-end path repair

- [x] WS1.1 Fix stale `codebase_chunks_384` test expectations in `tests/parent-atlas-workstation.spec.ts` (`atlas:qdrant:repair`, `atlas:qdrant:repair:preflight`) to match live `package.json` `codebase_chunks_768`; added `not.toContain('384')` regression guards — 4/4 tests pass
- [x] WS1.2 Fix duplicated-path bug in `scripts/atlas/parent-atlas-workstation-end-to-end.mjs` line 74: `path.join(WORKSPACE, 'sveltekit-frontend', 'scripts', 'atlas', 'backfill-feature-metadata.mjs')` doubled the `sveltekit-frontend` segment (`WORKSPACE` is already `REPO_ROOT/sveltekit-frontend`); fixed + added `assertScriptExists()` fail-loud gate
- [x] WS1.3 Re-ran `node scripts/atlas/parent-atlas-workstation-end-to-end.mjs` from repo root — path fix confirmed live: `featureMetadata` lane now executes (previously failed before reaching the script at all). Surfaced two further pre-existing bugs in `backfill-feature-metadata.mjs` (not part of the original two reported failures), both fixed in this pass:
  - `nes_chrom_packets` in `TIER_1_TABLES` referenced a table that does not exist live (`information_schema.tables` confirms absence) — removed from the tier list, same failure class as the documented `atlas_higher_hop_index`/`atlas_codebase_packets`/`atlas_feature_packets` precedent in project `CLAUDE.md` (stale reference removed, no table created)
    **CORRECTED 2026-09-08 (same day, later continuation)**: this "does not exist" claim, though
    it may have been accurate when the file's original 2026-08-02 comment was written, was
    **stale and wrong when re-confirmed here** — re-verified live via the exact same
    `information_schema.tables` method plus a direct `\d nes_chrom_packets`: the table exists,
    1,992 rows, with real `feature_id`/`feature_label`/`source_ref`/`metadata` columns matching
    `TABLE_COLUMN_MAP`'s existing (correct) entry for it. Re-added to `TIER_1_TABLES` in
    `backfill-feature-metadata.mjs`, live-run confirmed clean (`--table nes_chrom_packets` and
    the full default run both exit 0, `Missing feature_id: 0`). One real, calibrated caveat
    found and documented in the script's own header comment (not fixed further, since it needs
    a human spot-check, not code): `feature_id` is provably safe to backfill (the script only
    ever fills a null `feature_id`, never overwrites an existing one — verified by reading
    `backfillTable()`'s `inferredFeatureId = currentFeatureId || identity.featureId` logic, not
    assumed), but `feature_label` is null for all 1,992 rows and would be filled via an
    independently-computed candidate identity, which could describe a coarser/different
    classification than the row's own real `feature_id` already implies. Not data loss, but
    `--apply` against this table should get a human spot-check first, not be run blind.
  - `glyph_records` column map claimed a `source_ref` column; live schema (`\d glyph_records`) has no `source_ref`/`feature_id` at all, only `source_id` — corrected the map to `source_id`
  - Final run: `featureMetadata: PASS`; full pipeline result `WARN` (not `FAIL`) — the two WARN notes (`qdrantComponentParity` coverage, sampled packet coverage <95%) are pre-existing gaps unrelated to this fix, not new regressions
- [x] WS1.4 Resolve `atlas_packets` (61,659) vs `atlas_packet_registry` (58,324) parity gap — **DONE
      2026-09-08, applied to live Postgres.** Live counts had drifted slightly since this task was
      written (61,718 vs 58,324 by the time this was picked up — 3,394 missing, not 3,335 — real
      packets kept being created in between). Confirmed all 3,394 missing rows had non-null
      `packet_key`/`feature_id`/`source_ref` (no NOT NULL constraint risk) and were spread
      continuously from 2026-07-04 to 2026-09-05 (an ongoing drift, not a one-time migration gap).
      **Found 3 candidate backfill scripts, audited before running any of them (Duplication
      Prevention discipline)**: `backfill-packet-registry.mjs` (96 lines, clean, idempotent
      `ON CONFLICT (packet_key) DO NOTHING`, references only real live tables) is the one usable
      script. The other two are dead/broken, flagged not fixed at the time: `week1-backfill-packet-registry.mjs`
      selects from `atlas_codebase_packets`, a table project-root CLAUDE.md's own "Schema Mismatch"
      section already documents as **not existing**, and imports `createPool` from `pg` (not a real
      export — `pg`'s constructor is `Pool` — this script would crash at import time before even
      reaching the missing-table error); `week1-packet-registry-backfill.mjs` selects from
      `nes_chrom_packets` — **this specific claim was corrected same day, later continuation, see
      WS1.3's correction above: `nes_chrom_packets` is real and live**, so this script's actual,
      distinct bug (verified by actually running it, not just reading it) is
      `error: UNION types text[] and text cannot be matched` — a bare untyped `NULL as tags` in
      one UNION branch against the other branch's real `text[]` column.
      **Archived 2026-09-08 (same day, later continuation)**: both scripts confirmed genuinely
      broken via live execution (not just static inspection — `node <script> --dry-run` run
      directly against real Postgres for each), confirmed zero callers anywhere in the repo
      (grep across `src/`, `scripts/`, both `package.json`s, `.vscode/tasks.json`), and confirmed
      the working canonical replacement (`backfill-packet-registry.mjs`) already covers their
      intended capability correctly. Archived per this repo's archive-not-delete convention:
      `docs/archive-manifest.json` (2 new entries, full incident detail including the corrected
      `nes_chrom_packets` finding), cold-storage copies at
      `deeds_labs/archive/2026-09-08/week1-{backfill-packet-registry,packet-registry-backfill}.mjs.bak`,
      originals removed from `scripts/atlas/` via `git rm` (staged, not committed — recoverable via
      git history and the archive copy either way).
      **Ran `backfill-packet-registry.mjs` for real**: inserted exactly 3,394 rows (matching the
      live gap precisely), verified live before/after —
      `atlas_packets: 61,718` / `atlas_packet_registry: 58,324 → 61,718`, direct
      `LEFT JOIN ... WHERE r.packet_key IS NULL` count went `3,394 → 0`. Gap fully closed, no
      further action needed unless new packet writers continue to skip registry population (a
      separate, ongoing-drift question this task doesn't address — see WS1.5/general note below).
- [x] WS1.5 Report both join-coverage metrics for summary-promotion batches — **DONE 2026-09-08,
      fixed the exact bug this task describes, in `scripts/atlas/backfill-summary-layers-from-chunks.mjs`**
      (the "summary-promotion" script — promotes Gemma4 chunk summaries from
      `codebase_chunk_index` into the canonical `atlas_summary_layers` promotion surface).
      **Root cause, confirmed by reading the code**: `summaryRows` is built as
      `prepared.map(row => { if (!packetRow) { ...; return null; } ...; return insertRow; }).filter(Boolean)`
      — every row that failed the packet-context join was already mapped to `null` and removed by
      that `.filter(Boolean)`. `packet_context_join_pct` was computed as
      `pct(packet_context_found, summaryRows.length)` — since `summaryRows.length` can, by
      construction, only ever equal `packet_context_found` (every non-joined row was already
      filtered out), this percentage was **always exactly 100%** regardless of real join coverage
      — precisely the "18/97 reports as 100%" failure mode this task describes verbatim. The
      sibling `summary_context_pct` metric had the identical bug (same wrong denominator).
      **Fixed**: both metrics now use `report.counts.usable_candidates` (captured before the
      join-failure filter runs) as the denominator — the real, meaningful coverage number. Added 2
      new fields (`packet_context_join_pct_of_joined_rows`, `summary_context_pct_of_joined_rows`)
      that preserve the old (trivial, always-~100%) calculation *explicitly labeled as such*, so
      both denominators are visible side by side per this task's own request, rather than one
      silently replacing the other. Markdown report template updated to print both, labeled.
      **Live-proven** via a real bounded dry-run (`--dry-run --limit=200`, no writes): the fixed
      run reported `packet_context_join_pct: 23.44` (real coverage) vs
      `packet_context_join_pct_of_joined_rows: 100` (the old, now-correctly-labeled trivial value)
      — a dramatic, real gap that concretely reproduces the exact failure mode this task named,
      confirming the fix, not just a code-reading inference.
- [x] WS1.6 Investigate `qdrantComponentParity` WARN: `missing_points: 50` (all `codebase_chunks_384_v2` sample) — undefined repair-path row fields — **DONE 2026-09-08, root-caused and fixed 3 real bugs, all sharing one root cause, in `scripts/atlas/qdrant-parity-repair-core.mjs` + `qdrant-parity-repair.mjs`** (turned out more serious than the original "reporting output only" framing):
      - **Root cause**: `classifyParity()`'s returned object never has a plain `packet_key`/
        `qdrant_point_id`/`packet_id` field — only `rowPacketKey`/`rowQdrantPointId`/`rowPacketId`
        (from the Postgres row) and `payloadPacketKey`/etc (from the Qdrant payload). Every call
        site that read `.packet_key`/`.qdrant_point_id` directly off a `classifyParity()` result
        was reading nonexistent properties.
      - **Bug 1 (the originally-reported symptom)**: `qdrant-parity-repair.mjs`'s "Missing points"
        and "Quarantined" console reporting (3 call sites) printed `undefined  undefined` instead
        of the real packet identity. Fixed: read `r.rowPacketKey`/`r.rowQdrantPointId` instead.
      - **Bug 2 (more serious, found while fixing Bug 1 — the payload-repair path was silently a
        no-op)**: the `repairEligible` loop's `rowByKey.get(parityRow.packet_key)` lookup also hit
        the same nonexistent field, always returning `undefined` for `pgRow`, hitting
        `if (!pgRow) continue` on every iteration. **Every real `stale_point`/`incomplete_point`
        repair has been silently skipped, always, for every run** — the script would report
        `0 succeeded, 0 skipped, 0 failed`, indistinguishable from "nothing needed repair." Fixed:
        `rowByKey.get(parityRow.rowPacketKey)` / `qdrantPayloads.get(parityRow.rowPacketKey)`.
      - **Bug 3 (deepest, in the shared core — `generateRepairEvents()`'s `pushRepair()` helper)**:
        every emitted repair/quarantine event's `packet_id`/`packet_key`/`qdrant_point_id` fields
        were unconditionally `null` (same nonexistent-field read), and — more seriously — the
        event's dedup key (`` `${row.packet_id ?? row.packet_key ?? row.qdrant_point_id ?? 'n/a'}|${kind}` ``)
        always resolved to the constant `'n/a|<kind>'`, meaning a hypothetical multi-row batch call
        (the function has a documented batch-call form, `{collection, classifiedRows}`) would
        silently collapse every distinct packet's event into one. The existing test suite had
        actually encoded this bug as *expected* behavior (`assert.equal(ev.packet_key, null)`).
        Fixed: `pushRepair()` now prefers the authoritative Postgres row's real identity
        (`pgRow?.packet_key`, etc. — available on every real single-row call, which is the only
        call pattern any current caller actually uses) before falling back to the classifyParity
        row's `row*`-prefixed fields.
      - **Live-verified this WAS the real cause of the reported WARN**: re-ran the exact audit
        (`codebase_chunks_384_v2`, sample 50) after the fix — `missing_points: 50` (same count,
        expected — the fix corrects *reporting/repair*, not point existence) but the "Missing
        points" console output and the repair-eligible path now resolve real packet identities
        instead of `undefined`.
      - **Tests**: fixed 1 pre-existing test that encoded the bug (`ev.packet_key === null` →
        now asserts the real value), added 2 new regression tests (missing_point row identity
        propagation; multi-row dedup-collision proof for `generateRepairEvents`). 55/55 tests pass
        (`node --test scripts/atlas/qdrant-parity-repair.test.mjs`). Both edited `.mjs` files pass
        `node --check` (syntax-valid).

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
- [x] GS1.10 **RESOLVED 2026-09-08 — the specific blocker is already fixed in committed code,
      confirmed live, not just by re-reading source.** The design decision this task was blocked
      on (separate identity per layer, connect via typed edges, never reuse one ID field for two
      meanings) is exactly what the current `graph-snapshot-materializer.ts` already does:
      `packet`-type nodes are constructed with `treeNodeId: null` (not `packet.treeNodeId` as
      GS1.9 originally described), and a `DERIVED_FROM` edge connects the packet node to its
      owning tree node instead. **Live-verified today, not assumed**: ran
      `graph-snapshot-materializer.spec.ts` fresh — 9/9 pass, including the exact regression
      assertions `graphSnapshotNodes.filter(n => n.nodeType==='packet').every(n => n.treeNodeId
      === null)` and `graphSnapshotEdges` containing a `DERIVED_FROM` edge type. Since packet
      nodes never write a non-null `tree_node_id`, they cannot collide with a tree node's real
      `tree_node_id` under `atlas_graph_nodes_v2_tree_node_unique` (`UNIQUE(snapshot_id,
      tree_node_id) WHERE tree_node_id IS NOT NULL`) — the collision this task blocked on is
      structurally impossible with the current code. Git-blame confirms this is real, committed,
      independent work (the double-`packet:`-prefix fix in commit `03820ae695`, Aug 23, already
      references an existing `DERIVED_FROM` edge in its own commit message — the lineage-edge
      design was in place before that commit, not introduced by it), matching this file's own
      repeated observation that this exact file gets "independently upgraded on disk" between
      passes. **Do not re-litigate this specific collision** — it is resolved. The lineage-edge
      vocabulary from GS1.12 (`DERIVED_FROM`/`REPRESENTS`/etc.) is the adopted direction, confirmed
      by both the existing code and an independent design proposal reaching the same conclusion
      (see `openspec/changes/parent-atlas-packet-control-word-record/`, drafted the same session
      from unrelated NES/CHR97 glyph-architecture reasoning that arrived at an identical "canonical
      refs vs. compact state, connected by reference not merged" principle — renamed away from
      "CHR97"/"Glyph" mid-draft after finding those terms already denote a real, live,
      different-domain evidence-cartridge system; see that change's own design.md for the finding).
      **However, a NEW and different blocker now exists, unrelated to tree_node_id**, discovered
      while trying to re-verify with a live `--apply`: the operative script is no longer the plain
      `materialize-full-corpus-graph-snapshot.mts` this task originally described — that file is
      now a thin compatibility shim (`import
      './materialize-full-corpus-graph-snapshot-v3.mts';`) delegating to a real v3 rewrite with a
      much stronger safety model this task's history never mentions:
      - `--dry-run`/`--verify`/`--apply` all require a **complete, exactly-matching Graphify
        workspace manifest** (`graphify_runs` + `graphify_files`, matched on `workspace_revision`
        AND `source_manifest_digest`) for the current git/workspace state — computed live via
        `materializeWorkspaceRevisionOriginV1`, never accepted from a bare git-HEAD string. Ran it
        live against the current (uncommitted-changes-having) workspace: failed immediately with
        `GRAPH_WORKSPACE_MANIFEST_NOT_COMPLETE:NO_MATCHING_RUN` — none of the 19 existing
        `graphify_runs` rows match the current workspace revision. This is the tool correctly
        refusing to materialize a snapshot for a workspace state with no verified Graphify index
        behind it — not a bug.
      - `--apply` additionally requires **both** `ATLAS_GRAPH_SNAPSHOT_APPLY=1` **and**
        `ATLAS_NON_PRODUCTION_DATABASE=1` to even attempt a write. The second flag is a hard,
        explicit design signal that this script's `--apply` mode is not meant to run against a
        production database at all — setting it to `1` against `legal_ai_db` (the real production
        database) would be a false declaration, so **this session did not do that and did not run
        `--apply`**. The real promotion path from a `--verify`-passed v3 snapshot into production
        (if one exists) was not located this pass — flagged, not resolved.
      **Corrected status**: `TREE_NODE_ID_IDENTITY_COLLISION: RESOLVED` (live-proven via passing
      unit test). `FULL_CORPUS_APPLY: NOT_ATTEMPTED` (blocked by the v3 workspace-manifest-
      completeness gate, which requires a fresh Graphify indexing run this pass did not perform —
      a separate, potentially long-running operation, and out of scope for this identity-question
      review). `PRODUCTION_PROMOTION_PATH: UNKNOWN` (the non-production-only `--apply` gate implies
      one exists elsewhere; not found this pass).
- [x] GS1.11 **Status language corrected 2026-09-08** to match the GS1.10 finding above, replacing
      the original blanket caution (which predates knowing the collision was already fixed):
      `TREE_NODE_UNIQUENESS_CHANGE: RESOLVED` (was `BLOCKED` — the identity-collision concern this
      status was guarding is fixed, live-verified via `graph-snapshot-materializer.spec.ts`).
      `PROVISIONAL_STRUCTURAL_GRAPH_SNAPSHOT: DRY_RUN_PASS` — **unchanged**, still accurate; this
      pass did not produce a fresh dry-run against the *current* workspace revision (blocked by
      the new v3 manifest-completeness gate documented in GS1.10), so the most recent real
      dry-run evidence remains whatever predates this session. `CANONICAL_GRAPH_SNAPSHOT:
      NOT_PROVEN` — **unchanged**, still accurate for the same reasons this task originally gave
      (symbol reconciliation across reparses, domain/concept completeness, KNN/KMeans/SOM/PageRank
      currency are all separate, still-open questions this pass didn't touch).
      `GRAPH_SNAPSHOT_APPLY: NOT_ATTEMPTED` (was `ROLLED_BACK` — that described a specific historical
      attempt; this pass made no new attempt, blocked by the v3 gate above, and did not set the
      non-production-database flag to force one).
- [x] GS1.12 **Design guidance CONFIRMED ADOPTED 2026-09-08, not merely proposed** — the
      lineage-edges-instead-of-ID-reuse design below is what the current, live, tested code
      already implements (see GS1.10's finding above), and was independently re-derived the same
      session from a completely different starting point (an old NES/CHR97 glyph-encoding idea,
      reframed as a "canonical refs vs. compact state, connected by reference not merged"
      principle — see `openspec/changes/parent-atlas-packet-control-word-record/`, whose design.md
      cites this exact GS1.10-1.12 resolution as prior art; that change was itself renamed away
      from "CHR97"/"Glyph" mid-draft after those terms were found to already denote a real, live,
      different-domain evidence-cartridge system — see its design.md). Two independent paths
      arriving at the same architecture is a meaningful corroboration, not just a restated
      proposal. Original text preserved below since it remains an accurate description of the
      adopted mechanism:
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
- [x] Recommendation record / supersession: **classified + runtime-proven 2026-09-08** —
      `recommendation-record.ts` WIRED_WITH_CALLERS (re-exported via `ace/index.ts`);
      `phase109a-mcp-tools.ts` WIRED_WITH_CALLERS and dual-registered as live MCP tools in both
      `src/mcp/server.ts` (`phase109a_*` tools) and `src/mcp/trace-mcp-server.ts` — this is the
      cluster's real, MCP-discoverable entrypoint; `feature-record.ts` **ZERO_CALLERS** (real,
      typed, versioned CRUD with supersession — flagged dead, not archived, needs a keep/archive
      decision); `promote-results-outbox.ts` WIRED_WITH_CALLERS (dynamic import from
      `search-runtime.ts`, has its own spec `promote-results-outbox.spec.ts`). **Runtime-proven
      2026-09-08**: live `tools/call` against `phase109a_query_signal_history` over
      `trace-mcp-server` (`:8788`) returned a well-formed, schema-valid response
      (`{"events":[],"total_count":"0"}`) round-tripping through Drizzle to live Postgres — the
      MCP→handler→DB chain works. Honest caveat: `semantic_lifecycle_events` has **zero rows**
      (`entity_type='semantic_signal'`) in this environment, so only the empty-path was proven —
      no real historical signal event exists yet to prove a nonempty-result path against.
- [x] Validation receipts / proof gates: **classified + runtime-proven, schema drift FIXED
      2026-09-08** — `validation-result-v1.ts` WIRED_WITH_CALLERS (consumed by
      `classification-ledger-writer.ts`); `execution-review.ts` WIRED_WITH_CALLERS (dynamically
      imported by `routes/api/agent/execute/+server.ts`'s `reviewAndSaveExecution` — the
      cluster's only true runtime entrypoint); `scripts/opencode/validation-gate.mjs` was
      **ZERO_CALLERS and broken** (`.mjs` file calling CommonJS `require()`, which throws
      `ReferenceError: require is not defined` under real ESM) — **fixed** (converted to
      `import`/`export`, along with its dependency `scripts/opencode/alias-card-mapper.mjs`,
      verified by running `node scripts/opencode/validation-gate.mjs` cleanly). It remains a
      standalone demonstration/simulation script with no real caller — still zero callers, just no
      longer throwing if ever invoked.

      **Two real, previously-undocumented schema-drift bugs found and fixed, root cause and both
      migrations detailed below:**
      1. `loadToolCallEvents()` queried 12 columns (`execution_id`, `tool_namespace`, `status`,
         `start_time`, `end_time`, `duration_ms`, `result_class`, `result_count`,
         `source_ref_count`, `source_refs`, `from_server`, `event_json`) that never existed on
         the live `tool_call_events` table — confirmed via the sibling `outcome_ledger` table
         already having this exact intended shape live, and via `routes/api/agent/execute/+server.ts`'s
         own `INSERT INTO tool_call_events` (a second, independent call site) expecting the same
         columns — this was a genuine unmigrated schema, not a code bug in the reader. **Fixed**:
         `drizzle/manual/20260908_tool_call_events_execution_columns.sql` (additive
         `ADD COLUMN IF NOT EXISTS` × 12 + one partial index), applied to live Postgres with
         operator authorization, verified zero data loss (120 pre-existing rows from the
         unrelated, still-working `tool-call-recorder.ts` writer unchanged before/after).
      2. Fixing #1 surfaced a second, smaller drift: `saveExecutionReview()` also writes an
         `evidence_refs` column that `execution_reviews` never had. **Fixed**:
         `drizzle/manual/20260908_execution_reviews_evidence_refs.sql` (single additive column).
      3. **Verified end-to-end after both fixes**: `reviewAndSaveExecution(randomUUID())` now
         returns a well-formed result (`decision: "fail"`, `issues: ["No tool call events
         found", "No outcome ledger found"]` for a synthetic ID, as expected) and genuinely
         persists a row to `execution_reviews`, confirmed via a direct Postgres read. Also
         directly verified `routes/api/agent/execute/+server.ts`'s exact `INSERT INTO
         tool_call_events` shape now succeeds (previously silently swallowed by its surrounding
         try/catch, logged as `"[/api/agent/execute] Telemetry persistence error"` on every real
         call — this was a silent no-op bug, not a 500, which is why it went unnoticed).
      4. Committed test: `execution-review.integration.spec.ts` rewritten from a
         bug-characterization test to a real positive proof, passing live
         (`RUN_DB_INTEGRATION=1`).
- [x] Hot / warm / cold storage: **classified + runtime-proven 2026-09-08** — `engram_tools.ts` WIRED via
      `registerEngramTools` in `trace-mcp-server.ts` (already live MCP surface);
      `src/lib/server/cache/*` (30+ files) mostly has real callers but only **1 spec file total**
      (`ace-packet-cache-v1.spec.ts`) — a real coverage gap, not closed this pass. The
      `cold-storage-retrieval-service.ts` "duplicate" flagged by the initial search turned out
      **not to be a duplicate on inspection**: `src/lib/server/retrieval/cold-storage-retrieval-service.ts`
      is a thin `export *` re-export of the real implementation in
      `src/lib/server/features/rag/cold-storage-retrieval-service.ts`, and
      `hyperrag-fusion-service.ts` correctly imports the `retrieval/` alias — only a stale header
      comment needed fixing (done). **Runtime-proven 2026-09-08, both tiers, independently
      verified**: (1) hot tier — called MCP tool `engram.ace_packet_inject` with a real payload,
      got back `{"ok":true,"status":"written",...}`, then independently read the raw Valkey key
      (`ace:packet:<runId>`) directly via `valkey-cli` (bypassing the MCP layer entirely) and
      confirmed the exact injected content came back. (2) cold tier — called
      `ColdStorageRetrievalService.search()` directly against live Postgres and got 2 real rows
      back from `embedded_summaries` (pgvector cosine query executed for real, not mocked). Both
      tiers are genuinely live and functional.
- [x] Tensor / gRPC / protobuf: **classified 2026-09-08, HTTP fallback FIXED + runtime-proven
      2026-09-08 (same day, later continuation)** — `go-retrieval-grpc-client.ts`
      WIRED_WITH_CALLERS (imported by `atlas-index.ts`, `atlas-mastra-workflow.ts`, and the real
      HTTP entrypoint `routes/api/atlas/runtime-retrieve/+server.ts`); `atlas-semantic-tools.ts`
      WIRED_WITH_CALLERS and registered as MCP tool definitions in `src/mcp/server.ts`
      (`ATLAS_SEMANTIC_TOOL_DEFINITIONS`/`handleAtlasSemanticToolCall`), with its own spec file.
      Original finding stands as root-cause record: the gRPC path is a genuinely unimplemented
      `// TODO: Generate from .proto with protoc` stub (`getRetrievalGrpcClient()` always returns
      `null`) — expected to fall through to HTTP by design, not itself a bug. The real bug was the
      HTTP fallback calling fictional routes (`/retrieval/retrieve`, `/context/build`, `/validate`)
      that never existed on the live `legal-ai-go-retrieval` service.
      **Fixed**: `retrieveFromGoHttp()` now calls the real `POST /search/codebase` route (the
      closest real match for dense codebase retrieval, confirmed against
      `proto/active/retrieval.proto`'s `CodebaseSearchResponse`/`CodebaseChunk` messages AND the
      live response's actual snake_case JSON field names — protojson on this service does not use
      its camelCase default) and maps the response into `RetrieveResponse.evidence`. **Live proof**:
      called `retrieveFromGo()` end-to-end — returned 3 real evidence packets with real
      `packetKey`/`sourceRef`/`contentHash`/`denseScore` values from the live codebase index (not
      mocked). Committed test `go-retrieval-grpc-client.integration.spec.ts` rewritten from a
      bug-characterization test to a real positive proof, passing live
      (`RUN_LIVE_INTEGRATION=1`), skips cleanly without it.
      **Fixed 2026-09-08 (same day, later continuation)**: `buildContextFromGoHttp()`
      (`/context/build`) and `validatePacketFromGoHttp()` (`/validate`) had the identical bug —
      calling fictional routes with no real equivalent anywhere in the Go service's route table
      (confirmed: neither route exists in `services/go-retrieval-service/main.go`, and unlike
      `retrieveFromGoHttp` there was no close real match to redirect to). Both functions are
      genuinely live-called (not dead code) — confirmed real call sites at
      `routes/api/atlas/runtime-retrieve/+server.ts:198,228` (the `VERIFY`/`SYNTHESIZE` states of
      the same real HTTP entrypoint already classified `WIRED_WITH_CALLERS` above) and
      `atlas-mastra-workflow.ts:213`; both call sites already wrap the call in try/catch that
      silently degrades on failure (`VERIFY`'s catch logs and continues to `SYNTHESIZE` anyway,
      `SYNTHESIZE`'s catch logs and jumps to `COMPLETE` with partial results) — meaning this route
      had never actually verified a packet or built a real context packet on any real invocation
      before this fix, the same silent-swallow shape as the `execution-review.ts` bug fixed earlier
      this session. **Fix chosen: no new Go-side route** — both call sites' own stated intent
      (`VERIFY`'s comment: "Validate retrieved packets against Postgres canonical";
      `SYNTHESIZE`'s: assemble a bounded-token prompt from packet keys) is answerable directly
      against canonical `atlas_packets` in Postgres, consistent with this repo's Postgres-is-truth
      architecture and avoiding a needless cross-service hop for something Postgres already
      answers. `validatePacketFromGoHttp` now does a direct `packet_key` existence + `source_ref`
      identity check against `atlas_packets` (`PASS`/`FAIL`/`WARN` on mismatch);
      `buildContextFromGoHttp` now fetches the requested `packetKeys` from `atlas_packets` and
      assembles a bounded prompt (char/4 token estimate, truncates at the budget). **Live-proven**:
      2 new tests in `go-retrieval-grpc-client.integration.spec.ts` (gated `RUN_DB_INTEGRATION=1`,
      separate from the pre-existing `RUN_LIVE_INTEGRATION=1` Go-service test since these two paths
      now have zero Go-service dependency) — both pass against real Postgres: validated a real
      `packet_key` (`PASS`) and rejected an unknown one (`FAIL`, non-empty `errors`); built a
      real bounded context packet from 3 real `packetKeys` with nonzero prompt/tokenCount/evidence.
- [ ] SOM / KMeans / topology: **corrected 2026-09-08** — the two paths originally listed here
      (`sveltekit-frontend/src/lib/server/atlas/atlas_embedding_tools.ts` and
      `scripts/agents/som-cluster-cards.mjs`) do not exist anywhere in the repo (verified via
      direct `ls`/glob, not just grep). The real owners: `sveltekit-frontend/src/mcp/server.ts`
      (still correct — its `graph.index` tool with `steps:['som']` dynamically imports and calls
      `runSOMTopologyPipeline`), `sveltekit-frontend/src/lib/server/graph/som-topology-pipeline.ts`
      (WIRED_WITH_CALLERS via that tool, no dedicated spec file). Separately found and flagged, not
      fixed here: `sveltekit-frontend/src/lib/server/retrieval/phase2-som-training.ts` and
      `phase2-kmeans-clustering.ts` are real files with **zero callers repo-wide** — an explicit
      keep-or-archive decision is needed before treating them as part of this lane's runtime path.
      **Keep-or-archive decision resolved 2026-09-08 (same day, later continuation): KEEP.** The
      "zero callers" claim above was true only for production `src/` call sites — a real,
      currently-passing consumer exists: `tests/phase2-infrastructure-integration.spec.ts` (21
      tests, live-run confirmed 21/21 pass) imports and exercises `trainSOM`/`assignToSOM` from
      `phase2-som-training.ts`, `kmeans` from `phase2-kmeans-clustering.ts`, plus
      `projectToLatent64`/`projectBatchToLatent64` from a third sibling file,
      `phase2-autoencoder-bridge.ts` (not previously flagged). Together these three files form a
      coherent, self-contained "Phase 2" prototype pipeline (768-dim embedding → 64-dim latent →
      CPU SOM → CPU K-means) with its own producer/consumer/test structure — exactly the "coherent
      unwired scaffold" pattern this repo's own guidance warns against archiving on a bare
      zero-production-caller count. It is a plain-CPU proof-of-concept, superseded in the
      *production* retrieval path by the GPU-accelerated `trainSOM`/`kmeansWithCentroids` native
      addon (via `som-topology-pipeline.ts`'s `runSOMTopologyPipeline`, already `WIRED_WITH_CALLERS`
      above) — but superseded-in-production and dead-with-no-consumers are different claims, and
      only the first is true here. Archiving would have silently broken 21 passing tests to close
      this task faster, which this repo's own guidance explicitly prohibits. No action taken;
      corrected classification only.
- [x] NLP / LDR sidecar: **classified + runtime-proven 2026-09-08** — `ldr-research-tools.ts` WIRED_WITH_CALLERS,
      registered inside `trace-mcp-server.ts` (`registerLdrResearchTools`), backed by a real
      `searchViaSearXNG()` implementation in `src/lib/server/ldr/web-search-client.ts`
      (`SEARXNG_URL` fetch, not a stub). **Fragmentation flag retracted on inspection** —
      `ldr-research-tools.ts`'s own header comment confirms it intentionally reuses
      `executeLDRResearch`/`formatLDRResultForAgent` from `src/mcp/tools/ldr-research.ts` (the
      older stdio `server.ts` registration) rather than duplicating logic; it only adds the
      Streamable-HTTP registration on top. Not a duplicate, not two competing owners. **Runtime-
      proven 2026-09-08, real end-to-end**: called `tools/call` for `ldr_research` over live
      `trace-mcp-server` (`:8788`) with a real query (`"what is pgvector"`, bounded
      `maxResults:2, maxDocs:1`). Got back a real synthesized answer in 8.5s
      (`"success":true`, `confidence: 60.3%`) with a real SearXNG-sourced citation — SearXNG,
      the LDR orchestrator, and llama-server (Ornith) synthesis are all genuinely live and wired
      together. Separate, minor product observation (not a wiring bug): the synthesis prompt is
      hardcoded toward legal-research framing, producing an odd "this isn't a legal question"
      caveat on a plain technical query — a prompt-tuning issue, not an integration one.
- [x] Graph retrieval / projection: **classified + fixed + runtime-proven 2026-09-08** — this cluster is
      the best-tested of the seven (extensive existing `.spec.ts` coverage across both
      `retrieval/*` and `atlas/graph/*`). The CLAUDE.md-documented MCP graph tool names
      (`graph.expand_neighborhood`/`graph.shortest_path`/`clusters.get_summary_lenses`) were **not
      found registered** in `trace-mcp-server.ts` — that section of root CLAUDE.md is stale,
      flagged there directly.
      **Real, concrete "Neo4j fanout integration" finding, more significant than originally
      assumed**: `relationship-kernel-neo4j-projector-v1.ts` correctly shapes edges for Neo4j
      (binary edge for 2-participant relations, `:AtlasRelation` hub + `INCIDENT_TO` for n>2), but
      `projectRelationshipKernelsToNeo4j` has **zero callers repo-wide** — confirmed live via
      `MATCH ()-[r:ENTITY_CLASSIFIED_AS|CONCEPT_BROADER_THAN]->() RETURN count(r)` returning 0
      against the live Neo4j instance. So the edges this projector would write don't exist yet; the
      file's own docstring framing ("it makes them PRESENT in the graph") was aspirational, not
      current. **Fixed this pass**: `src/lib/server/ace/multihop-contextual-tree.ts`'s hardcoded
      relationship-type traversal whitelist now includes `ENTITY_CLASSIFIED_AS`/
      `CONCEPT_BROADER_THAN` (previously missing, exactly as the projector file's own comment
      predicted) — a necessary but not sufficient fix, since no producer calls the projector yet.
      **Fixed and runtime-proven end-to-end 2026-09-08 (later same-day continuation)**: wired the
      producer. `src/lib/server/atlas/kag-taxonomy-candidate-postgres.ts`'s
      `decideTaxonomyAssignmentCandidateV1()` — the one real call site that promotes a taxonomy
      candidate into a canonical `HyperedgeV1` (Postgres-truth, `persistHyperedges`) — now also
      converts that same edge via the pre-existing (already built, just unused)
      `hyperedgeToRelationshipKernel()` (`src/lib/server/graph/hyperedge-contract.ts`) and mirrors
      it to Neo4j via `projectRelationshipKernelsToNeo4j()`, matching this repo's Postgres-truth/
      Neo4j-mirror discipline: the mirror write is strictly best-effort and cannot roll back or
      hide the Postgres promotion (new `neo4jMirrored`/`neo4jMirrorError` fields on the `'promoted'`
      outcome report it honestly either way). 2 new tests added
      (`kag-taxonomy-candidate-postgres.spec.ts`, mirror-succeeds and mirror-fails-non-blocking
      cases, both mocked/hermetic, both pass). **Live, end-to-end proof, not just unit-tested**: ran
      the real chain (create candidate → persist → promote) against live Postgres, then
      independently queried Neo4j directly — `MATCH ()-[r:ENTITY_CLASSIFIED_AS]->() RETURN
      count(r)` went from 0 to 1, confirmed via `cypher-shell`, not just the return value of the
      call. Test data cleaned up afterward (zero footprint: candidate row, hyperedge row, and the
      Neo4j edge all deleted post-proof). The consumer-side whitelist fix (above) and this
      producer-side wiring now form a complete, proven, live chain — closing the "Neo4j fanout
      integration" gap this file originally flagged.
      **Runtime-proven 2026-09-08 (separate hyperedge path, distinct from the Neo4j multihop
      path above)**: called `traverseHop1()` directly (bypassing the dev-server requirement) —
      returned a well-formed structural response round-tripping through `searchHyperedges()` to
      live Postgres, no throw. This is genuinely live and functional, independent of the
      Neo4j-relationship-kernel gap noted above (two different graph-retrieval mechanisms in this
      one cluster, both real, only one — Neo4j n-ary relations — currently unpopulated).
      `POST /api/hypergraph/traverse` (the HTTP wrapper around this) itself was not separately hit —
      needs the SvelteKit dev server running, not attempted this pass.

Full architecture ownership map (kernel/GPU/RAM/storage/search layers, cross-referenced against
these clusters) published at
`sveltekit-frontend/docs/architecture/atlas-kernel-gpu-ram-storage-ownership-map.md` — consult it
before building new discovery/orchestration code for any of these surfaces.

### Next bounded search step

- [x] Reuse the located owner file for each surface instead of creating a parallel implementation
      — confirmed no new parallel implementation was created for any of the 7 clusters this pass.
- [x] Confirm the runtime entrypoint for each owner before any patch — done for all 7 clusters
      (see per-cluster classification above: WIRED_WITH_CALLERS / ZERO_CALLERS / MISSING file
      paths corrected where found stale).
- [x] Add tests at the owner boundary before wiring new code paths — **committed 2026-09-08**: the
      6 direct-invocation proofs were converted from one-off `tsx` scripts into real, repeatable
      Vitest spec files, run against the live stack, all passing (12/12 tests, 7/7 files):
      `tests/atlas-phase109a-signal-history.integration.spec.ts`,
      `tests/atlas-engram-hot-cache.integration.spec.ts`,
      `tests/atlas-ldr-research.integration.spec.ts` (gated `RUN_LIVE_INTEGRATION=1`, added to
      `vitest.config.ts`'s explicit `tests/` include list, since that directory only auto-includes
      via a large hand-maintained allowlist, not a glob),
      `sveltekit-frontend/src/lib/server/features/rag/cold-storage-retrieval-service.integration.spec.ts`,
      `sveltekit-frontend/src/lib/server/hypergraph/hypergraph-traversal.integration.spec.ts`
      (both gated `RUN_DB_INTEGRATION=1`, auto-included via the `src/**/*.{test,spec}.{js,ts}`
      glob), and 2 **characterization tests for the known-broken paths**
      (`sveltekit-frontend/src/lib/server/agent/execution-review.integration.spec.ts`,
      `sveltekit-frontend/src/lib/server/atlas/go-retrieval-grpc-client.integration.spec.ts`,
      gated `RUN_DB_INTEGRATION=1`/`RUN_LIVE_INTEGRATION=1` respectively) that assert the CURRENT
      broken behavior explicitly, with a file-header note to update/remove the assertion once the
      underlying bug is fixed rather than treating a new failure there as a regression. All 7
      files verified to skip cleanly (no live calls attempted) when their gate env var is unset —
      confirmed via a plain `npx vitest run` with no env vars set (12/12 skipped). New shared
      helper: `tests/trace-mcp-http-client.ts` (Streamable-HTTP JSON-RPC client for
      trace-mcp-server; `src/lib/server/mcp-client.ts` uses the older GET-based `/sse` transport
      trace-mcp-server no longer accepts and was found to have zero callers repo-wide — flagged,
      not fixed, out of scope for this pass). SOM/KMeans remains not exercised — the pipeline
      mutates live shared Qdrant payloads and writes real Neo4j edges via a native GPU addon,
      unsafe to invoke as a "test" without a bounded fixture first.
- [x] Record runtime proof separately from static discovery — done for all 7 clusters: 4 proven
      genuinely working (recommendation record, hot/cold storage, NLP/LDR sidecar, and the
      hyperedge half of graph retrieval/projection), 2 proven genuinely broken with root cause
      identified (validation receipts' `tool_call_events` schema drift; tensor/gRPC's
      double-broken gRPC+HTTP path), 1 not exercised for safety reasons (SOM/KMeans, see above).

## Session handoff (2026-09-08, same day continuation — separate from the inventory above)

Two follow-on threads from the same session, adjacent to this change but not part of its
"Repository-first search inventory" checklist. Recorded here for continuity since no other
OpenSpec change currently owns them.

### Thread 1 — TRACE-MCP-CENSUS-RECONCILE-01 (CLOSED)

Full name-level reconciliation of TRACE MCP's "120 static vs 176 runtime" tool-count question —
see `TRACE-MCP-AUDIT-COMPLETE.md`'s 2026-09-08 note (repo root) for the full writeup. Summary:
120/120 static names present at runtime, 56 runtime-only names all classified (54
`DELEGATED_MODULE_REGISTRATION`, 2 `COMPATIBILITY_ALIAS`), 0 unexplained, 0 duplicates — admission
PASS. New artifacts: `sveltekit-frontend/scripts/trace-mcp-census-reconcile-01.mjs` (`npm run
trace:mcp:census-reconcile`), `sveltekit-frontend/src/lib/server/atlas/contracts/trace-mcp-tool-census-v1.ts`,
receipt at `sveltekit-frontend/docs/reports/trace-mcp-census-reconcile-01-<date>.json`. Root
`CLAUDE.md`'s top-of-file MCP/Atlas status note updated to point here instead of a naked count.
Nothing left open on this thread — re-run the npm script for a fresh snapshot if tool counts drift
again, don't re-derive the reconciliation from scratch.

### Thread 2 — Claude Code skill/MCP wiring audit (CLOSED, one fix applied)

Audited every `.claude/skills/*/SKILL.md` for broken `allowed-tools` references (an MCP server a
skill lists but that isn't actually registered anywhere). Found one real gap, fixed:

- **`gemma4-offload` MCP server** was referenced by 2 skills (`trace-mcp-tooling`,
  `metadata-context-analysis`) but registered in *no* config this repo has (checked `.mcp.json`,
  `.opencode/opencode.jsonc`, `~/.claude.json`, `~/.claude/settings*.json` — all absent). Root
  `CLAUDE.md`'s claim that it's wired via `.opencode/opencode.jsonc` is stale (not present there
  either). The real implementation script does exist and runs cleanly:
  `sveltekit-frontend/scripts/mcp/gemma4-offload-mcp.mjs` (stdio, talks to llama-server on `:8090`
  with a `:1337` fallback, no required args). **Fixed**: added a `gemma4-offload` entry to
  `.mcp.json` (repo root), mirroring the existing `atlas-tools`/`atlas-task-kernel` pattern.
  Verified: `.mcp.json` still valid JSON, script starts cleanly and prints
  `[local-llm-offload] ready — primary=http://127.0.0.1:8090 ...`. **Takes effect on next Claude
  Code session start, not retroactively in the session that made the change** — MCP servers connect
  once at startup.
- Also created this session (already reported to the operator, not re-detailed here):
  `.claude/skills/atlas-tools-mcp/SKILL.md` — closes a separate discoverability gap where
  `atlas-tools`/`atlas-task-kernel` MCP tools existed and were wired but had no skill pointing an
  agent at them, so they went unused in favor of Grep/Bash for questions they could answer in one
  cheap call.
- Everything else checked clean: the 5 `openspec-*` skills (all correctly gated on
  `Bash(openspec:*)`, no broken refs), `bits-ui-svelte5`/`drizzle-schema-review`/
  `uno-css-design-system` (no `allowed-tools`, pure guidance, nothing to wire), `trace-mcp-tooling`'s
  own `mcp__trace__*` tools (real, live server — this session's own `mcp__trace` `ConnectionRefused`
  was independently diagnosed as a client-binding issue, not a wiring bug, no fix needed). The two
  `.opencode`-only skills (`mcp-toolchain`, `rg-atlas`) are plain prose guidance with no
  `allowed-tools` field — nothing to audit there, out of Claude Code's scope anyway.

**Nothing left open on this thread either** — the one real gap found was fixed and verified. If a
future session adds a new skill with `allowed-tools`, re-run the same check (grep every
`mcp__<server>__` reference in `.claude/skills/*/SKILL.md` against the servers actually listed in
`.mcp.json`) rather than assuming new skills got it right.

### Thread 3 — Two more real bugs found and fixed, same session, later continuation (CLOSED)

- **`execution-review.ts` schema drift** — `tool_call_events`/`execution_reviews` were missing 13
  columns two real call sites expected. Fixed via 2 additive migrations
  (`drizzle/manual/20260908_tool_call_events_execution_columns.sql`,
  `drizzle/manual/20260908_execution_reviews_evidence_refs.sql`), applied to live Postgres with
  explicit operator authorization. `execution-review.integration.spec.ts` rewritten from a
  bug-characterization test to a real positive proof, passes live.
- **Neo4j fanout producer wired** — `decideTaxonomyAssignmentCandidateV1()` now mirrors promoted
  taxonomy hyperedges into Neo4j via the pre-existing (previously unused)
  `hyperedgeToRelationshipKernel()` → `projectRelationshipKernelsToNeo4j()` chain. Live-proven:
  `ENTITY_CLASSIFIED_AS` edge count went 0→1 in Neo4j via the real promotion path, independently
  confirmed via `cypher-shell`, test data cleaned up after. 2 new tests in
  `kag-taxonomy-candidate-postgres.spec.ts`, both pass.
- **`retrieveFromGo()` HTTP fallback fixed** — was calling 3 fictional routes
  (`/retrieval/retrieve`, `/context/build`, `/validate`) that never existed on the live Go
  retrieval service. Fixed the one with a real equivalent (`retrieveFromGoHttp` now calls
  `POST /search/codebase`, verified against `proto/active/retrieval.proto` and the live response's
  actual snake_case field names) — live-proven, returns real evidence packets.
  `go-retrieval-grpc-client.integration.spec.ts` rewritten to assert success, passes live.
- **`buildContextFromGoHttp`/`validatePacketFromGoHttp` also fixed (later same-day continuation,
  after this section was first written — see the full writeup under "Graph retrieval / projection"
  → "Tensor / gRPC / protobuf" above)**: same fictional-route bug, but no real Go-side equivalent
  existed for either. Confirmed both have real live callers (`routes/api/atlas/runtime-retrieve/
  +server.ts`'s `VERIFY`/`SYNTHESIZE` states, `atlas-mastra-workflow.ts`) that were silently
  degrading on every call. Fixed by implementing both directly against canonical Postgres
  (`atlas_packets`) instead of adding new Go routes — matches each call site's own stated intent
  and avoids an unnecessary cross-service hop. 2 new tests (`RUN_DB_INTEGRATION=1`) pass live.

## Next steps for handoff (2026-09-08, end of session, updated — same-day later continuation)

**Fully closed this session** (all 7 "Repository-first search inventory" clusters except SOM/KMeans,
plus GDS1.1–1.10 fully, WS1.1–1.6 fully, and several standalone bugs found along the way):
recommendation record, hot/cold storage, NLP/LDR sidecar, validation receipts (schema drift,
fixed), tensor/gRPC (both `retrieveFromGoHttp` AND `buildContextFromGoHttp`/`validatePacketFromGoHttp`
fixed — the latter two by implementing them directly against canonical Postgres rather than adding
new Go routes, since no real Go-side equivalent existed), graph retrieval/projection (both the
hyperedge path and the Neo4j fanout producer, fixed). Plus: the `atlas-tools-mcp` skill gap and the
`gemma4-offload` MCP wiring gap (Claude Code skill/MCP audit thread); the bounded BFS tool
(GDS1.8, new); revisioned named-projection naming (GDS1.9, additive-only, not wired as a new
default); PageRank distribution verification (GDS1.10 — corrected: this was already done, live
data disproved the "NOT STARTED" claim, no re-run needed); the `atlas_packets`/
`atlas_packet_registry` parity gap (WS1.4 — closed, 3,394 rows backfilled, live-verified 0 missing);
join-coverage reporting bug (WS1.5 — fixed, the exact "18/97 reports as 100%" pattern the task
named, live-proven with a real dry-run showing 23.44% vs the old always-100% value); the
`qdrant-parity-repair.mjs` reporting/repair bug (WS1.6 — turned out to be 3 separate bugs sharing
one root cause, including a previously-unknown one: the payload-repair path for stale/incomplete
points had been silently a no-op on every run, always reporting "0 succeeded, 0 skipped, 0 failed"
indistinguishable from "nothing needed repair").

**GS1.10–1.12 resolved 2026-09-08 (same day, later continuation)** — see the corrected entries
above. Short version: the `tree_node_id` identity collision this was blocked on is already fixed
in committed code (packet nodes never set a non-null `tree_node_id`; a `DERIVED_FROM` edge
connects them to their tree node instead), live-reconfirmed via `graph-snapshot-materializer.spec.ts`
(9/9 pass). A *different*, newer blocker was found while trying to re-verify with a live `--apply`:
the operative script is now a v3 rewrite (`materialize-full-corpus-graph-snapshot-v3.mts`) gated
behind a complete Graphify workspace-manifest match for the exact current workspace revision (none
exists for the current uncommitted state) and an explicit `ATLAS_NON_PRODUCTION_DATABASE=1`
declaration for `--apply` — which this session correctly did not set against the real production
database. A companion OpenSpec change,
`openspec/changes/parent-atlas-packet-control-word-record/`, was drafted the same session
(contracts + proof-gate only, not started) — an unrelated NES/CHR97 glyph-architecture reframing
that independently arrived at the same lineage-edge identity principle, now cited there as
corroborating prior art. **Renamed mid-draft, same session**: it initially reused "CHR97"/"Glyph"
naming until a real, live, different-domain collision was found (`src/lib/server/cartridge/
glyph-record.ts`/`chr97-builder.ts`, a legal-evidence cartridge system already fully traced in
`openspec/changes/ace-hyperrag-chr97-graphify-audit/`) — every contract in the new change was
renamed (`PacketControlWordV1` etc.) before the naming collision could propagate further.

**Genuinely still open — only 1 item remains, intentionally left alone for a pre-existing,
documented reason, not an oversight**:

1. **SOM/KMeans pipeline** (`runSOMTopologyPipeline`) — still never exercised. It mutates live
   shared Qdrant payloads and writes real Neo4j `SIMILAR_TOPOLOGY` edges via a native GPU addon
   (`tensorrt_bridge.node`). Before running it for real: build a bounded fixture first (small
   synthetic Qdrant collection + isolated Neo4j namespace), matching this repo's own
   GPU-MINI-FABRIC-01 proving-ground discipline — do not invoke it against shared production-
   adjacent data as a "test."

**New, separate open question found this pass (not this task's to resolve)**: what is the real
production-promotion path for a `--verify`-passed v3 graph snapshot, given `--apply` explicitly
refuses to run without declaring the target database non-production? Not investigated — flagged
for whoever next touches the graph-snapshot-v3 pipeline.

**Cross-tree note, partially addressed 2026-09-08 (same day, later continuation)**: root
`openspec/changes/` (92 active dirs at time of this pass, up from 82) and
`sveltekit-frontend/openspec/changes/` (14 active dirs, up from 12) remain two separate,
unreconciled OpenSpec portfolios — a prior session flagged this as unresolved duplication (see
this repo's memory system, session 202). Rather than attempting a full reconciliation of all
106 directories (out of scope for a bounded pass), did a targeted, bounded check: diffed the two
directory-name listings for exact overlaps. Found exactly 2: the inert `archive/` subdirectory
(not a real change, expected in both trees, no action needed) and a genuine, concerning one —
`phase-2f1-real-evaluation-corpus`, present in both with **identical `created: 2026-07-12`
timestamps** in each copy's `.openspec.yaml` (proving common origin, not independent duplicate
authorship). Investigated and resolved: sveltekit-frontend's copy is the real, actively-implemented
one (`stage: implementing`, 40/56 tasks, real Drizzle migrations, 33,398 real evidence rows
populated in Postgres, 4 capability spec files); the root copy was a proposal-only stub (no
tasks.md, no evidence/, single combined spec.md) edited once more on 2026-08-08 with substantially
the same content, reworded but never actioned. Archived the root duplicate per
`docs/archive-manifest.json` (full diff evidence recorded there), `git rm`'d (staged, not
committed) from `openspec/changes/`. Confirmed post-archival: `openspec list` from root no longer
shows it; `openspec list` from `sveltekit-frontend/` still shows the real copy untouched at
40/56 tasks. **The other 104 non-overlapping directories were not audited for content-level
duplication** (only exact-name matches were checked) — a genuine near-duplicate under a different
name would not have been caught by this pass. Full reconciliation of the two portfolios remains
open if someone wants to pick it up; this pass only closed the one concrete, high-confidence case
a bounded check could surface.

**Broader sweep, same day, later continuation (user-requested)**: went beyond exact-name matching
to check keyword-adjacent pairs across the two trees for near-duplication under different names.
Checked 6 candidate pairs by reading proposal.md content directly (not assumed from names alone):

- `add-packet-ontology-registry` (sveltekit-frontend) vs `parent-atlas-ontology-kernel` (root) —
  **NOT a duplicate**. Former is tool-selection/telemetry ontology (packet_type enum, tool_registry
  telemetry, HMM/XGBoost routing feedback); latter is formal OWL/SHACL semantic-web ontology
  reasoning (ConstraintV2, profile-check adapter). Same word, different domain.
- `parent-atlas-ace-radix-residency` (sveltekit-frontend, 25/26) vs `parent-atlas-tensor-residency-integration`
  (root, 31/58) vs `parent-atlas-topology-representation-admission` (root, 6/24) — **NOT
  duplicates**, legitimate layered decomposition: a narrow, near-complete GPU radix-sort proof-gate
  vs. a broader tensor/Arrow/tile-residency umbrella vs. a separate representation-dimension-chain
  admission question. All three independently active with distinct task lists.
- `parent-atlas-retrieval-staging-planes` (sveltekit-frontend, ✓ Complete) vs
  `parent-atlas-retrieval-lod-algorithm-taxonomy` (root, 52/104) — **not a literal duplicate, but a
  real, unflagged coordination gap**: both independently diagnose the same underlying problem (too
  many uncoordinated retrieval-ranking owners) from different angles — staging-planes formalizes
  pipeline-STAGE boundaries (bi-encoder → RRF → rerank → LLM-judge → extraction → synthesis) and
  ships `HelperCardV1`/`StructuralFactV1`/`CandidateEvidenceCardV1`/`ModelResolutionV1` contracts;
  lod-algorithm-taxonomy names DOMAINS for the 13 competing fusion/scorer implementations
  specifically. Confirmed via grep: **neither cross-references the other anywhere in either
  change's files.** staging-planes is done and could be directly useful context for
  lod-algorithm-taxonomy's remaining 52 tasks (or vice versa) — flagged here for whoever continues
  the in-progress one, not resolved (would require judgment calls on a 52-task-remaining change
  this session doesn't own).
- `wire-agentic-workflows-e2e-test` (sveltekit-frontend, 0/90) vs `parent-atlas-agentic-completion`
  (root, no tasks.md) vs `parent-atlas-agentic-run-receipt-binding`/`parent-atlas-agentic-repair-bundle-integration`
  (root, both active) — **NOT duplicates**: the sveltekit-frontend one is E2E-test/validation-focused
  (telemetry wiring, A2A discovery test, perf baselines) against already-built infrastructure,
  distinct from the root changes' capability-building focus. Zero progress (0/90) but that reads as
  "never picked up," not "superseded" — no evidence either way found, not investigated further.
- **`phase1-rrf-semantic-fusion` (sveltekit-frontend) vs `parent-atlas-retrieval-fusion-reachability`
  (root, 55/62) — genuine finding, fixed**: `phase1-rrf-semantic-fusion` had shown **0/52 tasks
  since 2026-07-06** (2+ months, zero recorded progress) despite its exact proposed implementation
  being **fully live in production code today** — `rrf-lane-ranker.ts`, `rrf-combiner-utils.ts`,
  `signal-grouping.ts`, `semantic-fusion-metrics.ts`, `compute-rrf-score.ts` all exist with the
  exact function names/formula/lane-weight constants this proposal specified, and
  `compute-rrf-score.ts`'s own header comment literally quotes this proposal's language. This was
  a pure tracking gap (real work landed, likely folded into `parent-atlas-retrieval-fusion-reachability`,
  never circled back to close the original proposal), not missing work. **Fixed**: updated
  `phase1-rrf-semantic-fusion/tasks.md` directly — sections 1-4 and 6 marked `[x]` with individual
  live-verification evidence per item, honest gaps left `[ ]` (no dedicated unit tests found for
  the new modules; the formal NDCG/MRR validation run this proposal promised in section 7 was never
  independently confirmed, only the code path). New count: 18/49 tasks, `openspec validate` clean.

**Not checked in this broader pass**: the remaining ~98 directories with no keyword-obvious sibling
in the other tree. This pass targeted the pairs a human would flag by name recognition; a
systematic content-similarity pass (e.g. embedding every proposal.md and clustering) would be
needed to find a genuinely differently-named duplicate, and was judged out of scope for a bounded
continuation.

**Sweep completion, same day, later continuation**: finished auditing the remaining unchecked
sveltekit-frontend changes (all 13 real ones now checked at least once against root for
name/content overlap):

- `parent-atlas-code-langextract-evidence-lane` and `parent-atlas-gpu-mini-fabric-01` — both
  **already properly self-aware**: each explicitly cross-references its sibling
  (`parent-atlas-retrieval-staging-planes` and `parent-atlas-ace-radix-residency` respectively) in
  its own "Why" section. No action needed — these are exactly what good cross-tree awareness looks
  like, unlike the staging-planes/lod-algorithm-taxonomy gap above.
- `session-96-event-sourcing-gpu-complete` (sveltekit-frontend) — **genuinely empty scaffold**:
  only a bare `.openspec.yaml` (`created: 2026-06-29`) is tracked in git, no proposal/tasks/specs
  at all, `openspec list` reports "No tasks". Flagged, not archived — there is no content to lose
  or confuse duplication detection with, so the usual archive-with-manifest ceremony wasn't judged
  worth it for an empty shell.
- **`add-gemma4-retrieval-loop-hook-harness` — same "0/N tasks but actually done" pattern as
  `phase1-rrf-semantic-fusion`, found and fixed**: showed 0/10 tasks since 2026-07-30, but every
  single task turned out to be independently, individually live-verifiable: ran
  `scripts/opencode/smoke-retrieval-loop-hook.mjs` for real (not assumed), confirmed the appended
  JSONL row has every required key, confirmed dry-run-only behavior via a targeted grep (zero
  Qdrant/Redis/publish/mutation code paths in the smoke script), and confirmed
  `docs/architecture/gemma4-retrieval-loop-hook.md` exists with the exact safety-boundary language
  this proposal asked to record. Unlike phase1-rrf, this wasn't "code landed elsewhere without
  circling back" — this proposal's own stated job was writing one contract confirming pre-existing
  infrastructure behaves as claimed, and every check passed. Fixed: `tasks.md` updated to all
  `[x]` with individual live evidence per item; `openspec list` now shows **✓ Complete**.
- `phase-109b-repository-provenance-workflow` — **checked, left as-is, different situation from
  the two "fix" cases above**: 0/11 tasks since 2026-07-30, no root-tree overlap found (a passing
  reference in `parent-atlas-graphify-recovery-proof-ladder/proposal.md` confirms this proposal's
  own `npm run atlas:phase109b:workflow:dry` script is real and already wired as a step in another
  pipeline — not a competing implementation). But unlike the two fixed cases, this proposal's own
  tasks are genuinely **documentation/spec-writing tasks** ("record the 13-stage workflow contract
  in OpenSpec," "document the recommended query pipeline"), not "confirm code X exists and
  behaves" checks — verifying doc-writing tasks needs reading and assessing prose accuracy, a
  different and more subjective kind of check than the grep/run verification used elsewhere in
  this sweep. Confirmed the underlying npm script is real (not broken) and left the rest
  un-investigated rather than guessing at documentation completeness.

All 13 real sveltekit-frontend OpenSpec changes have now been checked at least once against root
for overlap in this sweep. The ~98 root-only directories with no sveltekit-frontend counterpart to
compare against remain unaudited for internal (root-vs-root) duplication — genuinely out of scope
for a name/content-adjacency sweep seeded from the smaller tree.

**Also found, flagged, not fixed (out of scope for their respective tasks, recorded per this
repo's Duplication Prevention "record what you found even when you don't fix it" rule)**:
- ~~`src/lib/server/retrieval/phase2-som-training.ts` / `phase2-kmeans-clustering.ts` — real files,
  zero callers repo-wide, need an explicit keep/archive decision~~ — **resolved 2026-09-08, KEEP**,
  see the corrected entry under "SOM / KMeans / topology" above: a real 21-test suite
  (`tests/phase2-infrastructure-integration.spec.ts`, live-run confirmed 21/21 pass) consumes both
  files plus a third sibling (`phase2-autoencoder-bridge.ts`), so "zero callers repo-wide" was
  incomplete (true for production `src/` only, not for tests). No archive action taken.
- ~~`scripts/atlas/week1-backfill-packet-registry.mjs` (references the nonexistent
  `atlas_codebase_packets` table, imports a nonexistent `createPool` from `pg`) and
  `week1-packet-registry-backfill.mjs` (references the nonexistent `nes_chrom_packets` table) —
  both dead/broken duplicates of the one real, working `backfill-packet-registry.mjs` (found
  during WS1.4). Neither deleted, per this repo's archive-not-delete convention.~~ — **resolved
  2026-09-08, ARCHIVED** (see WS1.4's corrected entry above for full detail, including the
  correction that `nes_chrom_packets` is real and live — the second script's actual bug is a
  UNION type mismatch, not a nonexistent table). Both confirmed broken via live execution, zero
  callers, superseded by the working canonical script; archived per
  `docs/archive-manifest.json` with cold-storage copies, originals `git rm`'d from `scripts/atlas/`
  (staged, not committed).
- **New finding, same audit pass**: `nes_chrom_packets` being wrongly excluded from
  `backfill-feature-metadata.mjs`'s `TIER_1_TABLES` (see WS1.3's correction above) was a stale
  premise inherited from a 2026-08-02 check that was true then but not now — corrected and
  re-added, live-run confirmed clean. A calibrated (not overstated) caveat about `feature_label`
  backfill semantics for this table is documented in the script's own header comment for whoever
  runs `--apply` against it for the first time.
- **Second real bug found and fixed while re-verifying the above, same audit pass**:
  `sveltekit-frontend/package.json`'s `atlas:feature-metadata:{verify,backfill,backfill:apply}`
  npm scripts invoked `node ../scripts/atlas/backfill-feature-metadata.mjs` — an extra `../` that
  resolves to the repo-ROOT `scripts/atlas/` directory, where this file does not exist. Confirmed
  live: `npm run atlas:feature-metadata:verify` threw `Error: Cannot find module
  'C:\...\deeds-web-app\scripts\atlas\backfill-feature-metadata.mjs'` before the fix. This
  script's real, canonical location was already established earlier in this file (WS1.2, same
  session): `sveltekit-frontend/scripts/atlas/backfill-feature-metadata.mjs` — the exact same
  "doubled/wrong path segment" failure class WS1.2 fixed in a different caller
  (`parent-atlas-workstation-end-to-end.mjs`), independently recurring here in `package.json`.
  Not a systemic issue across all `atlas:*` scripts — spot-checked: 871 other npm scripts use the
  same `../scripts/atlas/` prefix and were left untouched, since those scripts genuinely live in
  the root `scripts/atlas/` directory (confirmed for several via direct `ls`); only this one
  script's location differs from the pattern its own npm-script entries assumed. Fixed by dropping
  the `../` (3 lines); live-proven: `npm run atlas:feature-metadata:verify` now exits 0 with real
  output (all 4 `TIER_1_TABLES` verified, including `nes_chrom_packets`).

**Verification commands for the next session** (re-run rather than trusting these numbers stale):
```bash
cd sveltekit-frontend
npx openspec validate parent-atlas-trace-search-joinback-proof
npx openspec list
RUN_DB_INTEGRATION=1 RUN_LIVE_INTEGRATION=1 npx vitest run \
  src/lib/server/agent/execution-review.integration.spec.ts \
  src/lib/server/atlas/kag-taxonomy-candidate-postgres.spec.ts \
  src/lib/server/atlas/go-retrieval-grpc-client.integration.spec.ts \
  src/lib/server/features/rag/cold-storage-retrieval-service.integration.spec.ts \
  src/lib/server/hypergraph/hypergraph-traversal.integration.spec.ts \
  src/lib/server/graph/neo4j-gds-client-bfs.integration.spec.ts \
  src/lib/server/graph/graph-projection-manifest.spec.ts \
  tests/atlas-phase109a-signal-history.integration.spec.ts \
  tests/atlas-engram-hot-cache.integration.spec.ts \
  tests/atlas-ldr-research.integration.spec.ts
npm run trace:mcp:census-reconcile
node --test scripts/atlas/qdrant-parity-repair.test.mjs
```
