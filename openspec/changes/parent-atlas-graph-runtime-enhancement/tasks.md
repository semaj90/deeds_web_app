# Tasks: Parent Atlas Graph Runtime Enhancement

## T0 — Capture only (2026-08-09)

This change was created to hold a fully-specified external plan (GR0–GR10, 24-file manifest — see
`proposal.md`) received mid-session while working `parent-atlas-agentic-repair-bundle-integration`
T22/T23. Per this repo's established discipline for external "bundles" (see that change's own T0,
blocked pending the actual repair-toolkit files), nothing here is implemented — this is
capture-and-reconcile only.

**What's real and already true, independent of this plan** (from T22, live-verified 2026-08-09):
- Neo4j has 23,114 `CodebaseFile` nodes, 2,754 `IMPORTS`, 1,572 `TEST_COVERS_FILE`, 9,988
  `BELONGS_TO_FEATURE` relationships.
- A `codebase_file_path` index on `CodebaseFile.path` exists and is `ONLINE` (created ad hoc this
  session — GR0/01-required-indexes.cypher would make this declarative).
- This was a **bounded 5,000-file** `--apply` run, not the full 61,659-file graph — GR1 explicitly
  calls this out as "STALE," not fresh.

## Open decision — how far to go before the next session

Not resolved yet. Three options, not mutually exclusive across gates:

- [ ] **(a) Docs-only for now.** Keep this change as pure specification until a human explicitly
      requests GR0 execution. Lowest risk, matches the repair-bundle's T0 precedent exactly.
- [ ] **(b) Scaffold stub files matching the manifest**, each clearly marked not-implemented
      (mirroring the plan's own stated intent for the Java procedure —
      `EXPERIMENTAL_NOT_IMPLEMENTED`). Gives the directory shape without claiming working code.
- [ ] **(c) Actually implement GR0–GR3.** GR0 (below) confirms this is now technically unblocked —
      both plugins already installed, no jar placement or Neo4j restart needed. Still an open
      choice, not a decision made unilaterally: recommend proceeding gate-by-gate with each gate's
      result reported before starting the next, not a silent bulk implementation, per repair-bundle
      T0's precedent for external-plan caution.

## GR0 — Capability index proof — **DONE, confirmed live 2026-08-09**

- [x] Ran `CALL gds.list() YIELD name RETURN count(name)` and
      `CALL apoc.help("path") YIELD name RETURN count(name)` against the live Neo4j instance
      (bolt://127.0.0.1:7687, same instance as T22's edge-materialization work):
      - **GDS: 446 procedures registered** — installed and callable.
      - **APOC Core: 18 `path`-related procedures** (includes `apoc.path.expandConfig`) —
        installed and callable.
      - **Neo4j Kernel 5.26.27** (`CALL dbms.components()`).
- [x] Neither plugin is missing — GR0's infrastructure-risk branch does not apply. No jar
      placement, no Neo4j restart needed for GR2/GR3.
- [ ] Formalize the already-live `codebase_file_path` index (created ad hoc in T22) into
      `neo4j/01-required-indexes.cypher` (declarative, idempotent `CREATE INDEX ... IF NOT
      EXISTS`) — still not done, small follow-up.

## GR1 — Fresh, frozen graphify revision

- [ ] Run `cd sveltekit-frontend && npm run graphify:daily` for the full, unbounded refresh (not
      the 5,000-file bounded slice from T22). This is a long-running, multi-stage, GPU-touching
      pipeline — run it as its own explicit, monitored action, not bundled with other work.
- [ ] Freeze the resulting revision (per the plan's `Run-Graphify-Then-Freeze.ps1` concept) before
      any PageRank/community-detection output changes downstream.

## GR2/GR3 — PROVEN 2026-08-09 (live, implemented)

Implemented and smoke-tested per the user's minimal GR2/GR3 prompt (not the fuller GR2-GR10
speculative sequence below — those remain not-started). Full detail: see the sibling change
`parent-atlas-agentic-repair-bundle-integration` T22 for the original bug-fix writeup. Summary:

- **GR2 APOC bounded traversal — PASS.** `apoc.path.expandConfig`, 2 consecutive runs, no
  regressions.
- **GR3 GDS BFS — PASS**, with one correction along the way: `gds.bfs.stream` returns one row
  with `nodeIds` (the full reachable set) + a single synthetic `path` chaining them — NOT one row
  per node with individual hop-depth. A first-draft query read `length(path)` as per-node depth
  and got `depth=37` against `maxDepth=3` on a real seed, which is what caught the bug. Fixed by
  using `size(nodeIds)` and proving `maxDepth`'s effect via monotonicity (result size at
  `maxDepth=1` ≤ result size at `maxDepth=3`) instead.
  - **Per-node BFS hop distance (a hypothetical future `bfsHops` FeatureRow column) is
    NOT_PROVEN** by this or any corrected version of this query — `gds.bfs.stream`'s output shape
    doesn't carry it. If ever needed, use a traversal that explicitly emits distance/level per
    node (frontier-by-frontier BFS, or a suitably weighted `gds.allShortestPaths`), not this
    procedure.
- **GR3 Dijkstra — PASS.** Exercised the pre-existing, non-deprecated canonical owner
  (`runDijkstraContext()` in `sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts`) — no new
  implementation, per instruction.
- **GR3 PageRank — PASS, with a real bug found and fixed.** `gds.pageRank.mutate` throws on a
  second consecutive call against the same long-lived projection (`mutateProperty` already
  exists — it mutates new properties, doesn't overwrite). Fixed in the canonical owner
  (`runPageRankClient()`, `sveltekit-frontend/src/lib/server/graph/neo4j-gds-client.ts`) with a
  `gds.graph.nodeProperties.drop` self-heal before mutate — matches this file's existing self-heal
  pattern for relationship `cost`. Verified via 2 consecutive full runs of the smoke script: both
  PASS, same graph revision, finite scores, no drift.
  - **PageRank concurrency risk — PROVEN REACHABLE, not fixed (reported per instruction).** The
    self-heal sequence is `DROP mutateProperty` → `MUTATE mutateProperty`, with an `await` boundary
    between them where Node's event loop can interleave another request. Checked all real callers:
    `POST /api/code-intel/graph/gds-status` (`sveltekit-frontend/src/routes/api/code-intel/graph/gds-status/+server.ts:97`)
    calls this path via `runPageRankMutate()` for `action: 'pagerank'` **with no rate limit at
    all** — the 5-minute Redis rate limit at that route only applies to `action: 'full'` (line
    ~79-87). Any two authenticated users (or one user double-submitting) hitting that endpoint
    with `{action: "pagerank"}` concurrently can race the drop→mutate window. `runPageRankMutate`
    → `runPageRankClient` has no lock. **Not fixed here, per explicit instruction** — if this ever
    needs hardening, the fix is a projection+mutateProperty-scoped mutex/singleflight around
    drop+mutate, not more exception handling.

**Files changed this reconciliation pass** (canonical runtime — see repo root `neo4j/`,
`sveltekit-frontend/src/lib/server/graph/`, `scripts/atlas/smoke-gr2-gr3-graph-runtime.mts` for the
actual implementation; not duplicated here).

**Bundle reconciliation**: the untracked `parent-atlas-graph-runtime-enhancement/` directory at
repo root (the real 24-file bundle, discovered mid-session — see T22 in the sibling change for how)
had its own `neo4j/03-gds-bfs.cypher` with the identical `length(path)`-as-depth bug, unpatched.
Fixed in place, `manifest.json` hashes regenerated for the 2 changed bundle files
(`neo4j/03-gds-bfs.cypher`, `openspec/tasks.md`), bundle's own `README.md` given an explicit
CANONICAL-vs-REFERENCE table so a future session doesn't copy bundle files over the proven runtime
files. Direction of truth: live-tested repo code → bundle, never reversed. No bundle files were
copied over canonical runtime implementations.

## GR1, GR4–GR10

Not started. GR1 (fresh `graphify:daily` + revision freeze) is next, explicitly not run in this
reconciliation pass per instruction — bundle reconciliation and the first fresh graph rebuild are
deliberately kept as separate commits/sessions. GR4 is now narrower than originally scoped: PageRank
*implementation* is already proven (GR3) — GR4 means running it against a **frozen** revision and
recording provenance (one `pagerankAuthority` row, promoted, idempotent on repeat), not building
anything new. GR5–GR10 remain blocked in sequence behind GR1→GR4. See `proposal.md`'s "Gated
rollout order" for the full sequence — each gate gets its own task entry here only when actually
picked up, not pre-written speculatively (status-language discipline: PRESENT /
STATICALLY_REFERENCED / RUNTIME_SMOKE_PROVEN, not aspirational checklists mistaken for progress).

## GR1 — DONE (2026-08-09), with one gap found

`npm run graphify:daily` completed exit 0 (see `parent-atlas-workstation-todo.md` for the 5 SQL
bugs fixed to get here, commits `293cf2e85e`/`115c25df8e`). **Gap found**: `graphify:daily:chain`
does not call `sync-graph-truth-neo4j.mjs` — live Neo4j `CodebaseFile` (23,114) and `IMPORTS`
(2,754) counts are unchanged from before this run. `neo4j-graph-enrich.mjs` (phase16:gds:apply)
did run and populated 51,333 `SIMILAR_TOPOLOGY` edges, but still against the stale `codeGraph`
projection (2,114 nodes, 0 rels). No single revision-stamp artifact (workspace/source/graph
revision) is emitted by this pipeline today — that's a real gap, not withheld data.

**Live GDS projections as of this run**: `codeGraph` (2,114 nodes, 0 rels, stale, used by
`neo4j-graph-enrich.mjs`) and `codeTopology` (280,087 nodes, 185,095 rels — built during this
session's GR2/GR3 testing via `ensureProjectionClient`'s create-if-absent, not by `graphify:daily`
itself).

**Next step (not yet done)**: run `node scripts/atlas/sync-graph-truth-neo4j.mjs --apply`
(unbounded) to actually refresh Neo4j's structural graph before trusting GR2/GR3's PASS as
current, or before any GR5 diagnostic treats `codeTopology`'s size as "the fresh graph."

## GR1 sync executed (2026-08-09) — partial success, one unresolved anomaly

Ran `node scripts/atlas/sync-graph-truth-neo4j.mjs --dry-run` then `--apply` (unbounded, exit 0).
Independently re-verified live via direct Cypher over the HTTP endpoint (not trusting the script's
own success banner):

| Type | Script attempted | Live before | Live after | Verdict |
|---|---|---|---|---|
| `CodebaseFile` | 65,342 | 23,114 | 67,456 | Applied — see inflation note below |
| `ParentAtlasFeature` | 39,481 | — | 39,485 | Applied |
| `BELONGS_TO_FEATURE` | 58,556 | 9,988 | 58,843 | Applied, matches claim |
| `IMPORTS` | 9,175 | 2,754 | 3,452 | Applied, but far short of attempted |
| `TEST_COVERS_FILE` | 8,875 | 1,572 | **1,572 (zero net change)** | **Anomaly — not root-caused** |

**TEST_COVERS_FILE anomaly**: confirmed via `r.updatedAt` that all 1,572 relationships carry a
timestamp from this exact run — the write step executed and touched them — but the total count
did not move despite 8,875 candidate edges being attempted. Cypher's `MATCH (c1:CodebaseFile
{path: row.from}) MATCH (c2:CodebaseFile {path: row.to})` silently yields zero rows (no error) when
either path doesn't match an existing node, so ~7,300 attempted `MERGE` calls this run produced
nothing, with no error surfaced anywhere in the script's output.

Partial explanation found, not conclusive: sampled `deep-import-edges.jsonl`'s `test_covers_file`
rows and found several referencing `.claude/worktrees/agent-a38668f2/...` — a temporary agent
worktree already known to have been deleted from disk in a past session (see root `CLAUDE.md`,
"Freed 20GB by removing temporary agent worktrees"). This explains the `CodebaseFile` node-count
inflation (67,456 vs. the clean 61,659 `parent_atlas_documents` count — stale worktree paths still
present in `deep-import-edges.jsonl` get merged as phantom nodes) but does **not** fully explain why
`TEST_COVERS_FILE` specifically nets zero new edges while `IMPORTS` at least partially succeeded
(2,754→3,452). Stopped digging further here rather than open-ended root-causing in this pass —
flagging as NOT_PROVEN / open, not claiming the sync fully succeeded.

**Not yet done**: identify why `TEST_COVERS_FILE` MERGE targets miss at a much higher rate than
`IMPORTS` targets from the same filtered/normalized path space; consider whether stale
`deep-import-edges.jsonl` / `parent_atlas_documents` rows referencing deleted worktrees should be
purged before the next sync run (would fix the node-count inflation at the source rather than
tolerating phantom `CodebaseFile` nodes).

## GR5 — Leiden lane, status ladder (2026-08-09)

Parallel work (outside this session's direct tool calls, reviewed and committed — see
`scripts/atlas/compute-leiden-neo4j.mjs`, commit `3f8cf27748`) added a dedicated exact Leiden lane
via Neo4j GDS, writing `leiden_community_id` (Neo4j node property, distinct from Louvain's
`communityId`) plus a separate Postgres table — confirmed by inline review not to touch or
overwrite Louvain's data.

| Gate | Status |
|---|---|
| GR5.1 Louvain exact | PASS |
| GR5.2 Leiden exact dry-run | PASS — projection 59,692 nodes / 102,666 relationships, 57,638 communities |
| GR5.3 Leiden persistence (apply once, verify Postgres/Neo4j/Redis) | NEXT |
| GR5.4 Leiden idempotency (apply twice, no duplicate rows, deterministic) | NEXT |
| GR5.5 Louvain-vs-Leiden quality comparison | NEXT |
| GR5.6 Taxonomy promotion | BLOCKED on GR5.3–GR5.5 |
| GR5.7 Bounded taxonomy traversal | BLOCKED on GR5.6 |
| GR6 PPR | BLOCKED on GR5 |

**Central open diagnostic**: 57,638 communities against 59,692 nodes (near one-community-per-node)
must be explained before any promotion — candidates are (a) a fragmented projection (many
disconnected/small weakly-connected components), (b) relationship orientation, (c) missing/weak
edge weights, (d) Leiden resolution/config, (e) projection sparsity, or (f) genuine code-graph
structure. **Not yet measured**: weakly-connected component count, isolated node count,
component-size p50/p95/max. Do not tune Leiden config blindly before this is measured — a fragmented
projection would produce this exact symptom regardless of algorithm correctness.

**Full verification prompt is written and ready to run** (not yet executed this session) — see the
user's GR5.3–GR5.7 specification: record exact projection identity + Leiden config, measure
fragmentation, measure Leiden and Louvain metrics on the identical projection snapshot before any
apply, apply once and verify 3-store persistence, apply twice and prove idempotency, compare
Louvain vs. Leiden on coverage/modularity/singleton-ratio/community-size distribution, and
explicitly attribute the high community count to one of the 6 candidate causes above.
**Apply-mode succeeding is not evidence of taxonomy usefulness — keep those two proofs separate.**

## Cross-references

- `openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md` T22 (live graph state
  this plan reconciles against), T23 (superseded by this change — T23 should be edited to point
  here rather than duplicating content).
- `openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md` T5/T5a (PageRank
  promotion gate — direct dependency for GR4).
