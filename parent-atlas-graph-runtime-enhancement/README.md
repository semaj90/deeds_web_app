# Parent Atlas Graph Runtime Enhancement

Purpose: extend the existing Parent Atlas graph runtime without creating a second canonical graph/retrieval stack.

Roles:
- Neo4j + APOC Core: bounded query-time traversal.
- Neo4j GDS: BFS, Dijkstra, PageRank, PPR, Louvain, Leiden.
- Postgres: canonical lineage/revisions/promoted features.
- Redis/Valkey: disposable revision-scoped cache.
- RabbitMQ: graph-analysis job dispatch.
- RAPIDS cuGraph/cuVS: GPU parity and batch acceleration outside Neo4j.
- simdjson: fast JSONL edge census/dedup.
- Java: experimental Neo4j procedure scaffold only.
- TypeScript: canonical orchestration/contracts.

Promotion order:
1. Capability/index preflight.
2. Refresh/freeze Graphify revision.
3. APOC bounded traversal.
4. GDS BFS/Dijkstra.
5. One PageRank authority field.
6. Louvain vs Leiden.
7. PPR.
8. Neo4j ↔ cuGraph parity.
9. Qdrant ↔ cuVS parity.
10. semantic-best-first evaluation.
11. Java procedure only if external prototype proves value.

Rules:
- no GPU/JNI inside Neo4j;
- no unbounded APOC traversal;
- no Neo4j/Redis/RabbitMQ/Qdrant-local IDs as canonical identity;
- no active semantic 384 lane;
- no duplicate PageRank/authority feature family.

## CANONICAL vs REFERENCE (added 2026-08-09, after GR2/GR3 live proof)

**This entire directory is REFERENCE material.** The direction of truth is live-tested code →
this bundle, never the other way around. Do not import anything under `src/` here into a running
application, and do not treat any `.cypher` file here as the one actually executed in production.

| Concern | CANONICAL (live, imported, executed) | REFERENCE (this bundle — read/copy from, never import) |
|---|---|---|
| Traversal policy contract | `sveltekit-frontend/src/lib/server/graph/traversal-policy.ts` (minimal: `TraversalMode`, `TraversalPolicy` only — GR2/GR3 scope) | `src/graph/traversal-policy.ts` (fuller: `EDGE_COSTS_V1`, `TAXONOMY_POLICY_V1` — future GR6/GR10 scope, not wired anywhere yet) |
| APOC bounded traversal | `neo4j/apoc-bounded-neighborhood.cypher` (repo root) + `scripts/atlas/smoke-gr2-gr3-graph-runtime.mts` | `neo4j/02-apoc-bounded-neighborhood.cypher` (this bundle) |
| GDS BFS | same smoke script, uses `size(nodeIds)` + monotonicity proof | `neo4j/03-gds-bfs.cypher` (this bundle — patched 2026-08-09 to match the corrected semantics, but still reference-only) |
| GDS Dijkstra | `runDijkstraContext()` in `sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts` (pre-existing, exercised not reimplemented) | `neo4j/08-gds-dijkstra.cypher` / `neo4j/gds-dijkstra-smoke.cypher` (repo root) |
| GDS PageRank | `runPageRankClient()` / `getTopPageRankClient()` in `sveltekit-frontend/src/lib/server/graph/neo4j-gds-client.ts` (pre-existing, bug-fixed 2026-08-09 for mutate-idempotency) | `neo4j/04-gds-page-rank.cypher` (this bundle) |

If a future session is tempted to copy a `.cypher` or `.ts` file from this bundle straight into
`sveltekit-frontend/`, check this table and `openspec/changes/parent-atlas-graph-runtime-enhancement/tasks.md`
first — several files here were reference drafts that had real bugs (see `neo4j/03-gds-bfs.cypher`'s
history) before live testing caught them.
