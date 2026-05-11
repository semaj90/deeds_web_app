---
type: "cluster"
cluster_id: "cluster-81"
clusterId: 81
topic: "class chunks in `src/lib/services/knowledge-search` (tag: vector)"
aliases: ["cluster-81","class chunks in `src/lib/services/knowledge-search` (tag: vector)"]
memberCount: 176
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["vector","redis","vector-search","rag-pipeline"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__services__knowledge-search__knowledgesearcher]]"]
same: ["[[Clusters/cluster-73]]","[[Clusters/cluster-0]]","[[Clusters/cluster-16]]","[[Clusters/cluster-42]]","[[Clusters/cluster-62]]"]
tags: ["cluster","cluster/81","topic/topic_class","topic/topic_vector","topic/knowledge","topic/search","topic/services"]
---

# class chunks in `src/lib/services/knowledge-search` (tag: vector)
## For future Claude
> Cluster of 1 files. Top dirs: src/lib/services/knowledge-search. Top tags: vector, redis, vector-search. Risk: medium.
cluster:: cluster-81
cluster_id:: 81
member_count:: 1
pagerank_sum:: 0
risk:: medium
top_tags:: vector, redis, vector-search, rag-pipeline
## Agent hints
Use this cluster when investigating vector, redis, vector-search.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-73]] (jaccard 0.50)
- same:: [[Clusters/cluster-0]] (jaccard 0.40)
- same:: [[Clusters/cluster-16]] (jaccard 0.40)
- same:: [[Clusters/cluster-42]] (jaccard 0.40)
- same:: [[Clusters/cluster-62]] (jaccard 0.40)
## Top Directories
- `src/lib/services/knowledge-search` (1)
## Top Tags
- vector (1)
- redis (1)
- vector-search (1)
- rag-pipeline (1)
## Members (1)
- contains:: [[Files/src__lib__services__knowledge-search__knowledgesearcher|src/lib/services/knowledge-search/KnowledgeSearcher.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 81 SORT pagerank DESC LIMIT 30
```