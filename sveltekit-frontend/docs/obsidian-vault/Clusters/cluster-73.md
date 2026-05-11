---
type: "cluster"
cluster_id: "cluster-73"
clusterId: 73
topic: "function chunks in `src/lib/server/retrieval` (tag: vector)"
aliases: ["cluster-73","function chunks in `src/lib/server/retrieval` (tag: vector)"]
memberCount: 476
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["vector","redis","embedding","rag-pipeline","graph-db"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__retrieval__legal-pagerank]]","[[Files/src__lib__server__retrieval__citation-graph]]","[[Files/src__lib__server__graph__couchdb-pagerank]]","[[Files/src__lib__server__retrieval__document-dag]]","[[Files/src__lib__server__rag__ranker]]","[[Files/src__lib__server__retrieval__topological-search]]","[[Files/src__lib__server__retrieval__graph-context]]","[[Files/src__lib__server__types__retrieval]]"]
same: ["[[Clusters/cluster-0]]","[[Clusters/cluster-16]]","[[Clusters/cluster-42]]","[[Clusters/cluster-62]]","[[Clusters/cluster-46]]"]
tags: ["cluster","cluster/73","topic/types","topic/topic_vector"]
---

# function chunks in `src/lib/server/retrieval` (tag: vector)
## For future Claude
> This cluster provides utilities for logging and analyzing various stages of a retrieval-augmented generation (RAG) pipeline, including recording chunk hits, chunking text by sentences, and generating aggregated inference statistics.

**Purpose:** Observability and Analytics Layer
cluster:: cluster-73
cluster_id:: 73
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: vector, redis, embedding, rag-pipeline, graph-db
## Agent hints
Use this cluster when investigating vector, redis, embedding.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-0]] (jaccard 0.60)
- same:: [[Clusters/cluster-16]] (jaccard 0.60)
- same:: [[Clusters/cluster-42]] (jaccard 0.60)
- same:: [[Clusters/cluster-62]] (jaccard 0.60)
- same:: [[Clusters/cluster-46]] (jaccard 0.50)
## Top Directories
- `src/lib/server/retrieval` (8)
- `src/lib/server/types` (4)
- `src/lib/server/graph` (2)
## Top Tags
- vector (10)
- redis (9)
- embedding (8)
- rag-pipeline (5)
- graph-db (1)
## Members (8)
- contains:: [[Files/src__lib__server__retrieval__legal-pagerank|src/lib/server/retrieval/legal-pagerank.ts]]
- contains:: [[Files/src__lib__server__retrieval__citation-graph|src/lib/server/retrieval/citation-graph.ts]]
- contains:: [[Files/src__lib__server__graph__couchdb-pagerank|src/lib/server/graph/couchdb-pagerank.ts]]
- contains:: [[Files/src__lib__server__retrieval__document-dag|src/lib/server/retrieval/document-dag.ts]]
- contains:: [[Files/src__lib__server__rag__ranker|src/lib/server/rag/ranker.ts]]
- contains:: [[Files/src__lib__server__retrieval__topological-search|src/lib/server/retrieval/topological-search.ts]]
- contains:: [[Files/src__lib__server__retrieval__graph-context|src/lib/server/retrieval/graph-context.ts]]
- contains:: [[Files/src__lib__server__types__retrieval|src/lib/server/types/retrieval.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 73 SORT pagerank DESC LIMIT 30
```