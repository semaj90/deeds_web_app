# Proposal: Parent Atlas Graph Runtime Enhancement

## Problem

The HTTP retrieval/repair routes currently own graph-algorithm semantics directly — Cypher
variable-length expansion (`-[:IMPORTS*1..3]->`) is used as a BFS substitute inline in route code.
This means: no depth/cost budgets enforced consistently, no reusable traversal-policy vocabulary
("repair callers", "test neighborhood", "dependency neighborhood", "feature implementation"), and
no separation between cheap bounded query-time expansion and heavier analytics-grade algorithms
(PageRank, Louvain/Leiden, similarity).

Separately, `gds.shortestPath.astar` might look like an attractive existing GDS primitive for
"find the best code path," but its heuristic is Haversine (lat/lon) distance — built for
geographic graphs, single-threaded. Using it for semantic code-path search would silently produce
wrong results (optimizing a heuristic that has nothing to do with the actual objective).

## Proposal

Adopt the layered split in `README.md`: APOC Core for bounded query-time expansion, Neo4j GDS for
analytics algorithms, a RAPIDS/cuGraph sidecar (separate failure domain) for GPU-accelerated
parity/offline work, and Parent Atlas's own semantic best-first / weighted-A* implementation
(TypeScript first) for anything requiring embedding-similarity + taxonomy-distance heuristics —
explicitly not routed through `gds.shortestPath.astar`.

## Captured bundle manifest (external spec, not yet created)

The originating brief describes a 24-file bundle. Listed here for traceability — **none of these
exist yet**:

**Neo4j / Cypher** (`neo4j/`):
- `00-capability-preflight.cypher` — verify GDS/APOC available before anything else runs
- `01-required-indexes.cypher` — including `CodebaseFile.path` (already created live this session
  via T22, ad hoc — this file would make that declarative/repeatable)
- `02-apoc-bounded-neighborhood.cypher`
- `03-gds-bfs.cypher`
- `04-gds-page-rank.cypher`
- `05-gds-ppr.cypher` (Personalized PageRank)
- `06-gds-louvain.cypher`
- `07-gds-leiden.cypher`
- `08-gds-dijkstra.cypher`

**TypeScript runtime layer** (`src/graph/`):
- `traversal-policy.ts` — named policies (repair callers, test neighborhood, dependency
  neighborhood, feature implementation) mapped to `apoc.path.expandConfig` relationship-filter
  strings
- `taxonomy.ts`
- `semantic-best-first.ts` — explicitly marked experimental, not GDS A*; `f(n)=g(n)+h(n)`

**Accelerator layer** (`python/`):
- `rapids_graph_worker.py` — direct RAPIDS worker (cuGraph PageRank/Louvain/Leiden parity vs.
  Neo4j GDS output, GPU-based, supports personalization)
- `rabbitmq_graph_worker.py` — queue wrapper around the above, added only after direct parity is
  proven (queues: `parent-atlas.graph-analysis.v1`, `.graph-analysis-request`,
  `.graph-analysis-result`, `.graph-analysis-dlq`)

**Native** (`simd-bridge/` or similar):
- `simdjson_edge_scan.cpp` — fast JSONL parse + path normalization + `IMPORTS` filtering +
  unique-`(from,to)`-pair census for `deep-import-edges.jsonl`-style workloads. Directly addresses
  this session's T22 finding (8,376 raw candidates vs. 2,643 unique pairs) — this would compute
  that census natively/fast instead of via a one-off Node diagnostic.

**Java** (`java/atlas-neo4j-procedures/`):
- Scaffold only, deliberately returns `EXPERIMENTAL_NOT_IMPLEMENTED`. Establishes the integration
  shape for a future `CALL atlas.semanticBestFirst(...)` custom procedure, without claiming it
  works yet.

**Cache/queue wiring**:
- Redis/Valkey: revision-scoped keys (e.g. `atlas:graph:<revision>:...`) so cache entries cannot
  silently survive a graph revision change.
- RabbitMQ: dispatcher only, not an analytics engine.

**Ops scripts** (PowerShell):
- `Test-ParentAtlasGraphRuntime.ps1` — checks Neo4j, APOC, GDS, `CodebaseFile.path` index, Redis/
  Valkey, RabbitMQ
- `Run-Graphify-Then-Freeze.ps1` — refresh `graphify:daily`, then freeze the revision before any
  PageRank/community-detection output changes

## Gated rollout order (GR0–GR10)

1. **GR0** — capability index proof (Neo4j + APOC + GDS present and callable; `CodebaseFile.path`
   index confirmed `ONLINE` — already true live per T22, this gate formalizes checking it)
2. **GR1** — fresh, frozen `graphify:daily` revision (this session's bounded 5,000-file `--apply`
   run does not satisfy this — full 61,659-file refresh required, per T23's "graph freshness:
   STALE" note)
3. **GR2** — APOC bounded traversal wired for at least the 4 named policies (repair callers, test
   neighborhood, dependency neighborhood, feature implementation)
4. **GR3** — GDS BFS + Dijkstra wired and compared against the current inline Cypher
   variable-length approach
5. **GR4** — one PageRank authority feature landed end-to-end (Postgres → feature row), reusing
   existing PageRank promotion-gate work from `parent-atlas-agentic-repair-bundle-integration` T5
6. **GR5** — Louvain + Leiden (community detection)
7. **GR6** — Personalized PageRank (query-conditioned relevance)
8. **GR7** — cuGraph/cuVS parity proof against the Neo4j GDS outputs from GR3–GR6
9. **GR8** — RabbitMQ + Redis/Valkey wiring (dispatch + revision-scoped cache)
10. **GR9** — simdjson edge-census parity proof (native vs. this session's ad hoc Node diagnostic)
11. **GR10** — semantic best-first (TypeScript), custom Java procedure only if profiling proves
    the TypeScript/Python prototype too slow

**Hard rule carried through every gate**: APOC traversal calls must always be bounded (max depth +
relationship filters + uniqueness + result limits) — APOC procedure memory is not fully tracked by
Neo4j's normal memory tracker, so an unbounded `apoc.path.expand*` call can cause JVM heap
pressure.

## Explicit non-goals

- Do not use `gds.shortestPath.astar` for semantic/code-path search (wrong heuristic domain).
- Do not install APOC Extended without a specific proven-needed capability.
- Do not embed CUDA/cuVS/cuGraph inside a Neo4j Java plugin, ever.
- Do not let the repair-orchestration spine (from the sibling repair-bundle change) become part of
  this graph runtime, or vice versa — "repair spine consumes graph runtime; graph runtime does not
  become another repair orchestrator."

## Relationship to `parent-atlas-agentic-repair-bundle-integration`

That change's Phase 15 (HMM tool-selection design) has an open custom-traversal-logic question.
Per this proposal, that design should check whether APOC `expandConfig` already covers the policy
in question before inventing new traversal code. That change's T5/T5a (PageRank promotion gate) is
the direct dependency for this proposal's GR4.
