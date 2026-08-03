# PageRank NetworkX vs Neo4j GDS Parity Proof

Generated: 2026-08-03T02:20:28.003462+00:00
Overall status: **PASS**

## Fixture

6 nodes, 5 directed weighted edges (same topology as the operator's spec example):
```
parser -> chunker -> retrieval -> synthesis <- validation (weight 2.0)
synthesis -> recommendation
```

## Normalized scores

| Node | NetworkX (normalized) | Neo4j GDS (normalized) | cuGraph (normalized) | Delta (max) |
|---|---|---|---|---|
| parser | 0.067158 | 0.067158 | 0.067158 | 0.000000 |
| chunker | 0.124242 | 0.124242 | 0.124242 | 0.000000 |
| retrieval | 0.172764 | 0.172764 | 0.172764 | 0.000000 |
| validation | 0.067158 | 0.067158 | 0.067158 | 0.000000 |
| synthesis | 0.271092 | 0.271092 | 0.271092 | 0.000000 |
| recommendation | 0.297586 | 0.297586 | 0.297586 | 0.000000 |

## Gates

| Gate | Status |
|---|---|
| GRAPH_PAGERANK_NETWORKX | PASS |
| GRAPH_PAGERANK_NEO4J | PASS |
| GRAPH_PAGERANK_CUGRAPH | PASS |
| GRAPH_VERTEX_IDENTITY_MAP | PASS |
| GRAPH_SCORE_PARITY | PASS |
| GRAPH_REVISION_LINEAGE | NOT_APPLICABLE_SYNTHETIC_FIXTURE |

Max absolute delta (normalized): 0.000000
Top-ranked node match: True
Rank order match: True
