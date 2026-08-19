---
name: graph-evidence
description: Expand revision-qualified structural, graph, KAG, and n-ary evidence through the Parent Atlas host bridge for already nominated canonical IDs. Never creates canonical relations itself.
---

# Graph Evidence

```python
graph = await graph_evidence(canonical_ids=semantic["ids"])
```

The package submits a typed `GRAPH_EVIDENCE` request to the Parent Atlas host. The host chooses NetworkX/cuGraph/Neo4j/hypergraph executors, graph projection, hop budget, and receipts.

## Rules

- Graph is one logical evidence lane regardless of PageRank/HITS/Leiden/BFS/KAG/hypergraph features.
- Derived similarity/community/locality edges are evidence hints, never canonical `CALLS`/`IMPORTS`/`REFERENCES` facts.
- Obey graph/workspace revisions and bounded hop/candidate budgets.
- No canonical DB writes, graph writes, repository writes, or materialization.
