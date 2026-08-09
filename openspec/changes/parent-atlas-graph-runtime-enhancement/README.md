# parent-atlas-graph-runtime-enhancement

Formalizes which Neo4j/graph-algorithm surface owns which job for Parent Atlas, so the HTTP
retrieval/repair routes stop hand-rolling Cypher variable-length expansion as an ad hoc BFS
substitute. Captures a fully-specified external plan (received 2026-08-09, reconciled against this
session's live findings) — **nothing in this change is implemented yet**, per this repo's own rule
that external "bundles" get captured and reconciled before any code lands (see the sibling change
`parent-atlas-agentic-repair-bundle-integration`, whose T0 is blocked on the same discipline).

## Status (2026-08-09, just created — capture only)

**Trigger**: this session's T22/T23 work in `parent-atlas-agentic-repair-bundle-integration`
(fixed 2 real bugs blocking `IMPORTS`/`TEST_COVERS_FILE` Neo4j edges, applied a bounded 5,000-file
run, found and fixed a missing `CodebaseFile.path` index) surfaced a live, working graph — 23,114
`CodebaseFile` nodes, 2,754 `IMPORTS`, 1,572 `TEST_COVERS_FILE`, 9,988 `BELONGS_TO_FEATURE` — but
also exposed that the repo has no formal split between query-time traversal, analytics-grade graph
algorithms, and GPU-accelerated parity/offline work. An external review, given that live state,
proposed the GR0–GR10 gated plan in `tasks.md`.

**Done this session**: OpenSpec change scaffolded (this file + `proposal.md` + `tasks.md`), full
GR0–GR10 gate sequence and 24-file bundle manifest captured verbatim from the brief.

**Not done, deliberately**: no Cypher/TypeScript/Python/C++/Java files created yet, no Neo4j plugin
(APOC Core / GDS) installation attempted, no `npm run graphify:daily` refresh run. All of that is
real infrastructure change (plugin jars on disk, Neo4j restart, new source files across 5
languages) that needs an explicit go-ahead per file/stage, not a single-shot bulk creation — see
"Open decision" below.

## Core architectural split (the thing being formalized)

| Layer | Owns | Notes |
|---|---|---|
| APOC Core (query-time) | Bounded, filtered neighborhood expansion | `apoc.path.expandConfig` — relationship-type filters, direction, min/max depth, uniqueness, termination/allow/deny lists. Replaces hardcoded `IMPORTS*1..3`-style Cypher. Officially supported by Neo4j. |
| Neo4j GDS (analytics) | BFS, Dijkstra, PageRank, PPR, Louvain, Leiden, similarity, embeddings | `gds.bfs.stream` supports target nodes, depth termination, relationship cost budgets — a real BFS, not Cypher variable-length expansion pressed into service as one. |
| RAPIDS/cuGraph sidecar (offline, GPU) | High-volume algorithm parity/acceleration | Kept as a separate failure domain from Neo4j — GPU crashes/memory pressure must never be able to take Neo4j down. Direct RAPIDS worker first; RabbitMQ wrapping only after direct parity is proven. |
| Parent Atlas orchestration (TypeScript, later Java) | Semantic best-first / weighted A* | `f(n) = g(n) + h(n)`, `g` = typed edge cost, `h` = `1 - cos(θ)` between embedding + taxonomy/routing distance. Explicitly **not** `gds.shortestPath.astar` (that heuristic is Haversine lat/lon, single-threaded, built for geographic graphs). |

**Explicit non-goal**: don't embed CUDA/cuVS/cuGraph inside a Neo4j Java plugin. Custom Java
procedures are possible (Neo4j officially supports them, current docs target Java 21 + Neo4j
2026.06) but are a "later, only if TypeScript/Python prototype proves too slow" item — not now.

**Plugin posture**: GDS + APOC Core, yes. APOC Extended: not yet (community-maintained, not
officially supported — add only for a specific proven-needed capability). GPU/JNI plugin: no.

## See also

- `openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md` T22 (live graph state
  this plan is reconciled against) and T23 (the same architecture guidance, captured inline there
  first, now split out into this dedicated change since it's substantial enough to track on its
  own — T23 there now points here).
- `openspec/changes/parent-atlas-graph-retrieval-proof/README.md` (graph retrieval proof lane —
  check before duplicating traversal-policy work).
