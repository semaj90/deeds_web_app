# TRAVERSAL_RULES.md

## Retrieval Order
semantic -> top_k -> graph traversal -> telemetry -> reranker -> agent

Never:
graph -> answer

## Tricubic Search
Semantic:
- embedding_768
- embedding_384
- cosine similarity

Topology:
- latent_64
- som_row
- som_col
- som_index
- cluster_id

Runtime:
- telemetry
- traces
- commands
- errors

tricubic_search(q) = semantic ∩ topology ∩ runtime

## 4D Topology
x = som_row
y = som_col
z = cluster
t = time

Ontology is NOT a coordinate.

## Multi-hop Traversal
Allowed:
packet -> feature -> domain -> community -> concept -> file
packet -> references -> calls -> errors -> fixes

Maximum hop depth: 4 unless benchmarked.

## Preferred Algorithms
- BFS
- Dijkstra
- A*
- Personalized PageRank
- PageRank
- Louvain
- HITS
