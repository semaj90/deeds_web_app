# Parent Atlas Graph Runtime Enhancement — gated ladder

## GR0 Capability — PROVEN 2026-08-09 (live)
- [x] APOC Core version proven — 18 `path` procedures registered.
- [x] GDS version proven — 2.13.10, edition "Unlicensed" (Community — 4-core algorithm
      concurrency cap regardless of physical CPU count).
- [x] CodebaseFile.path index ONLINE/100% — created ad hoc during GR2/GR3 work, index
      `codebase_file_path`, confirmed 100% population.
- [ ] Redis/Valkey reachable — not checked as part of this reconciliation.
- [ ] RabbitMQ reachable — not checked as part of this reconciliation.

## GR1 Fresh graph — NEXT (not started)
- [ ] Run `graphify:daily`. Not run this session — GR2/GR3 proved the runtime surface against the
      existing (stale, bounded 5,000-file) graph, deliberately not combined with a graph rebuild.
- [ ] Freeze graph/workspace revision and counts.
- [ ] Verify the full chain, not just a new `codebase-graph.json` timestamp: fresh Graphify →
      Neo4j synchronized to that revision → GDS projection recreated from that revision. A stale
      Neo4j sync behind a fresh Graphify artifact would silently invalidate this freeze.

## GR2 Online traversal — PROVEN 2026-08-09 (live)
- [x] Prove bounded apoc.path.expandConfig — PASS, 2 consecutive runs.
- [x] Keep maxDepth + limit mandatory — enforced in
      `scripts/atlas/smoke-gr2-gr3-graph-runtime.mts` and `neo4j/apoc-bounded-neighborhood.cypher`
      (canonical runtime copy at repo root `neo4j/`, not this bundle).

## GR3 Algorithmic traversal — PROVEN 2026-08-09 (live), with one open sub-item
- [x] Prove gds.bfs.stream — PASS. **Correction to this bundle's own `neo4j/03-gds-bfs.cypher`**:
      the original version read `length(path)` as a per-node hop-depth; live testing showed
      `traversalLength: 37` against `maxDepth: 3` on a real seed — `gds.bfs.stream` returns ONE row
      with `nodeIds` (the full reachable set) plus a single synthetic `path` chaining all of them,
      not one row per node. Patched in this bundle (see file). The proof that survives: run at
      `maxDepth=1` then `maxDepth=3`, assert `reachableCount(1) <= reachableCount(3)` — proves the
      parameter has real effect, does not independently verify each node's shortest hop distance.
- [ ] **Per-node BFS hop distance (`bfsHops` FeatureRow column) — NOT_PROVEN.** `gds.bfs.stream`'s
      output shape doesn't carry it. If a real per-node hop-distance is ever needed, use a
      traversal that explicitly emits distance/level per node (frontier-by-frontier BFS, or a
      suitably weighted `gds.allShortestPaths`) — not this procedure. Do not backfill `bfsHops`
      from any `length(path)` read against `gds.bfs.stream`.
- [x] Prove typed-weight Dijkstra — PASS (existing owner `runDijkstraContext` in
      `sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts`, exercised not reimplemented).
- [x] Do not use geospatial GDS A* for semantic routing — upheld; not touched.
- [x] **PageRank idempotency bug found + fixed** (not originally a GR3 checklist item, surfaced by
      testing): `gds.pageRank.mutate` throws on a second consecutive call against the same
      long-lived projection (`mutateProperty` already exists). Fixed in the canonical owner
      (`runPageRankClient`, `sveltekit-frontend/src/lib/server/graph/neo4j-gds-client.ts`) with a
      `gds.graph.nodeProperties.drop` self-heal before mutate. Verified via a repeat-run test:
      ensure projection → run PageRank → read top results → run PageRank again → read top results
      → PASS (both calls succeed, same graph revision, finite output, no drift).
- [ ] **Concurrency risk — NOT_PROVEN either way, reported not fixed.** The self-heal sequence is
      `DROP mutateProperty` then `MUTATE mutateProperty` — a window exists where the property is
      absent. If `runPageRankClient` can be invoked concurrently for the same projection (two
      requests interleaving drop/mutate), a race is possible. Whether concurrent invocation is
      actually reachable in this codebase has not been checked. If it is, the fix is a
      projection-scoped mutex/singleflight around drop+mutate, not more exception handling — but
      this is a hardening item for whoever confirms the concurrency risk is real, not applied here.

## GR4 Authority — BLOCKED BY GR1
- [ ] PageRank on **frozen** graph (not the current stale/bounded one).
- [ ] Promote one `pagerankAuthority` with provenance (implementation already proven in GR3 —
      GR4 is "run it against a frozen revision and record provenance," not "build it").
- [ ] Acceptance: graph revision matches frozen revision; node coverage explained; all scores
      finite; L1 normalization valid; promotion run recorded; one authority feature only; second
      execution idempotent (already proven at the implementation level in GR3).

## GR5 Taxonomy — BLOCKED BY GR4
- [ ] Louvain baseline.
- [ ] Leiden candidate.
- [ ] Compare modularity, stability, subsystem purity.

## GR6 Query-conditioned authority — BLOCKED BY GR5
- [ ] Seed PPR from repair/query evidence.
- [ ] Ablate separately from global PageRank.

## GR7 GPU parity — BLOCKED, and re-scoped (2026-08-09 finding)
- [ ] Direct RAPIDS worker before RabbitMQ. **Verified live, 2026-08-09**: `cudf` 26.06.01,
      `cugraph` 26.06.00, `cuvs` all import successfully in WSL2 conda env `atlas-rapids-cu13`
      (`/home/james/miniforge3`). This was previously assumed absent — it exists and works.
      `cuml` and `nx_cugraph` both fail with the same `libcublas.so.13: undefined symbol
      cublasLtZZZMatmulAlgoGetHeuristicForStream` — a CUDA library ABI mismatch, not a missing
      package. Fix that before depending on either.
- [ ] Neo4j ↔ cuGraph PageRank parity.
- [ ] Louvain/Leiden parity (blocked additionally on the `nx_cugraph` breakage above if that path
      is used for Louvain/Leiden GPU comparison).
- [ ] Qdrant ↔ cuVS exact parity.

## GR8 Messaging/cache — LATER
- [ ] Revisioned RabbitMQ job/result envelopes.
- [ ] Redis/Valkey keys include workspace+graph+algorithm revision.
- [ ] No canonical truth in cache.

## GR9 simdjson — LATER
- [ ] Compile fast JSONL census. Python `simdjson` binding not installed anywhere checked
      (native Windows, WSL2 base, `atlas-rapids-cu13` env) as of 2026-08-09.
- [ ] Match JS counts/unique pairs before adopting — the JS census already exists (this session's
      dedup diagnostic: 8,376 raw candidates → 2,643 unique pairs), so this comparison is
      unblocked whenever `native/simdjson_edge_scan.cpp` is built.

## GR10 Semantic best-first — EXPERIMENTAL, LATER
- [ ] TypeScript prototype.
- [ ] Compare against BFS/Dijkstra/PPR in Domain #10.
- [ ] Java procedure remains uninstalled until proven.

Promotion rule: no LIVE_CANONICAL without identity proof, revision lineage,
baseline comparison, executable test, Domain #10 evidence, and zero unexplained regressions.
