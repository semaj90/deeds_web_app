# Parent Atlas graph algorithm router

This note records the intended relationship between Parent Atlas retrieval, graph expansion, temporal lineage, and available graph backends. It is intentionally implementation-oriented: vendor examples are translated into Atlas contracts instead of copied as standalone demos.

## Existing Parent Atlas boundaries

- `.claude/TRAVERSAL_RULES.md` keeps the order `semantic -> top_k -> graph traversal -> telemetry -> reranker -> agent` and caps ordinary multi-hop traversal at four hops unless benchmarked.
- `sveltekit-frontend/src/lib/server/retrieval/bounded-resolution.ts` defines `ResourceEnvelopeV1` and resolution outcomes such as `BOUNDARY_EXHAUSTED`.
- `sveltekit-frontend/src/lib/server/analysis/k-best-viterbi.ts` owns temporal/revision path decoding. Viterbi is not a graph-neighborhood traversal algorithm.
- `python/parent_atlas_networkx_pagerank.py` is the NetworkX PageRank correctness oracle.
- `sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-parity-contract.ts` already compares NetworkX/cuGraph graph projections and PageRank/Louvain evidence.
- `python/atlas_rapids_sidecar.py` already probes cuGraph/cuVS capability in the WSL2 GPU environment.

## Current external algorithm surfaces checked

Official references checked 2026-08-16:

- RAPIDS cuGraph supported algorithms: https://docs.rapids.ai/api/cugraph/stable/graph_support/algorithms/
- cuGraph traversal API: https://docs.rapids.ai/api/cugraph/stable/api_docs/cugraph/traversal/
- cuGraph homogeneous neighbor sampling: https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.homogeneous_neighbor_sample/
- cuGraph Leiden: https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.leiden/
- Neo4j GDS BFS: https://neo4j.com/docs/graph-data-science/current/algorithms/bfs/
- Neo4j GDS Dijkstra single-source: https://neo4j.com/docs/graph-data-science/current/algorithms/dijkstra-single-source/
- Neo4j GDS Yen k-shortest paths: https://neo4j.com/docs/graph-data-science/current/algorithms/yens/
- Neo4j GDS PageRank: https://neo4j.com/docs/graph-data-science/current/algorithms/page-rank/
- NetworkX A*: https://networkx.org/documentation/stable/_modules/networkx/algorithms/shortest_paths/astar.html

## Router contract

`graph-algorithm-policy.ts` selects an algorithm from intent and bounded resources. Selection is deterministic and does not itself execute graph work.

| Atlas intent | Selected algorithm | Intended executor |
| --- | --- | --- |
| `neighborhood` | BFS / reverse BFS | Neo4j live graph; later cuGraph frozen snapshot |
| `dependency_path` | BFS for unit cost, SSSP for positive weights | Neo4j or cuGraph |
| `alternative_paths` | Yen k-shortest paths when a target exists | Neo4j GDS |
| `authority` | personalized PageRank | cuGraph or Neo4j GDS |
| `community_context` | BFS constrained by promoted Leiden labels | Neo4j live graph |
| `structural_core` | k-core | cuGraph or NetworkX oracle |
| `similarity` | bounded Jaccard | cuGraph or NetworkX oracle |
| `explore` | bounded neighbor sampling | cuGraph preferred |
| `revision_lineage` | k-best Viterbi | Parent Atlas temporal DP module |

## Why Leiden/Louvain are not ordinary `expand` operations

Community detection should normally be computed against a revision-qualified graph snapshot and promoted as a derived feature. Query-time expansion can then use a community id as a filter. Re-running Leiden or Louvain for every user query would mix global graph analysis with local traversal and spend the resource envelope before evidence expansion begins.

The current cuGraph Leiden API supports undirected weighted graphs and exposes resolution/max-iteration controls. Parent Atlas should record those parameters and graph revision in the producing receipt. Louvain remains useful as a parity/challenger signal because the existing snapshot parity contract already tracks `louvainCommunityAgreement`.

## BFS

cuGraph exposes BFS with a depth limit; Neo4j GDS BFS supports maximum-depth and traversal-budget termination. These map directly to `ResourceEnvelopeV1.maxGraphHops` and the candidate/time limits enforced by `graph-expansion-adapter.ts`.

The first live adapter deliberately uses bounded Cypher over Neo4j because it is available without assuming GDS installation. It accepts only validated integer hop depth and caps it at four according to the repo traversal rule.

## SSSP / Dijkstra

Use weighted shortest path only when edge costs have a defined positive meaning. Example Parent Atlas projection costs might encode confidence/relationship penalties, but those weights need their own revisioned contract before they affect canonical routing.

cuGraph supplies GPU SSSP; Neo4j GDS supplies Dijkstra and recommends Delta-Stepping when a parallel single-source computation is more appropriate. Until the Parent Atlas executor is actually wired and parity-tested, the adapter returns `ALGORITHM_UNAVAILABLE` rather than an empty success response.

## Yen k-shortest paths

Yen is useful for a bounded set of alternative dependency routes, e.g. several plausible call/import paths between a failing route and an owning symbol. It requires a target. Results should be evidence branches, not separate retrieval-lane votes.

## Personalized PageRank

Global PageRank stays an authority prior. Personalized PageRank is query-conditioned structural expansion seeded by already-resolved candidates. Do not count Qdrant, cuVS exact, CAGRA, and PPR as separate semantic votes; executors and graph-derived expansion remain subordinate to logical lanes.

## Neighborhood sampling

cuGraph homogeneous neighbor sampling accepts `fanout_vals`, one fan-out per hop. This is the natural GPU implementation of Parent Atlas bounded exploratory expansion:

```text
seed candidates
  -> fanout [8, 4, 2]
  -> canonical identity hydration
  -> dedupe
  -> candidate envelope check
  -> receipt
```

The fan-out schedule must be derived from the resource envelope, not invented by the model.

## A* and Manhattan distance

A* is intentionally not in the first router enum. It is safe only after Parent Atlas has a heuristic whose relationship to graph path cost is proven. Manhattan distance over semantic embeddings or arbitrary SOM coordinates is not automatically an admissible shortest-path heuristic. NetworkX exposes A* and a caller-provided heuristic, but Parent Atlas should keep Manhattan/Hilbert/SOM coordinates as routing features until an admissibility proof exists for a specific projected graph.

## Viterbi / HMM

Viterbi belongs to a temporal lane. For example, observations across revisions can score candidate symbol identity using AST continuity, source movement, signature/name changes, graph-neighborhood overlap, and `changed_by` evidence. The output is a likely revision lineage. That lineage may provide seeds to graph expansion, but Viterbi should not randomly choose a graph algorithm.

## Fail-closed implementation order

1. Real bounded Neo4j BFS/reverse-BFS.
2. Add test fixture parity for BFS against NetworkX.
3. Add cuGraph BFS against the frozen graph snapshot and compare node distances/predecessors.
4. Add positive-weight contract, then NetworkX/Neo4j/cuGraph SSSP parity.
5. Add personalized PageRank using existing PageRank projection rules.
6. Add promoted Leiden labels and `leiden_filtered_bfs`.
7. Add bounded neighbor sampling with envelope-derived `fanout_vals`.
8. Add Yen only to source-target path requests.
9. Keep A* disabled until a concrete admissible heuristic is proven.

Each new executor should move from `ALGORITHM_UNAVAILABLE` to executable only after it has a revision-qualified fixture and parity receipt.
