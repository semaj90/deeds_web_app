---
type: "cluster"
cluster_id: "cluster-62"
clusterId: 62
topic: "type chunks in `src/lib/types` (tag: vector)"
aliases: ["cluster-62","type chunks in `src/lib/types` (tag: vector)"]
memberCount: 1
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["vector","redis","embedding"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__types__global]]"]
same: ["[[Clusters/cluster-0]]","[[Clusters/cluster-16]]","[[Clusters/cluster-42]]","[[Clusters/cluster-46]]","[[Clusters/cluster-49]]"]
tags: ["cluster","cluster/62"]
---

# type chunks in `src/lib/types` (tag: vector)
## For future Claude
> Cluster of 1 files. Top dirs: src/lib/types. Top tags: vector, redis, embedding. Risk: medium.
cluster:: cluster-62
cluster_id:: 62
member_count:: 1
pagerank_sum:: 0
risk:: medium
top_tags:: vector, redis, embedding
## Agent hints
Use this cluster when investigating vector, redis, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-0]] (jaccard 1.00)
- same:: [[Clusters/cluster-16]] (jaccard 1.00)
- same:: [[Clusters/cluster-42]] (jaccard 1.00)
- same:: [[Clusters/cluster-46]] (jaccard 0.75)
- same:: [[Clusters/cluster-49]] (jaccard 0.75)
## Top Directories
- `src/lib/types` (1)
## Top Tags
- vector (1)
- redis (1)
- embedding (1)
## Members (1)
- contains:: [[Files/src__lib__types__global|src/lib/types/global.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 62 SORT pagerank DESC LIMIT 30
```