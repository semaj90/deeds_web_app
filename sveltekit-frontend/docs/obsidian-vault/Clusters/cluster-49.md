---
type: "cluster"
cluster_id: "cluster-49"
clusterId: 49
topic: "type chunks in `src/lib/server/cache` (tag: vector)"
aliases: ["cluster-49","type chunks in `src/lib/server/cache` (tag: vector)"]
memberCount: 2
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["vector","embedding","cache","redis"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__server__cache__cartridge-tensor-bridge]]","[[Files/src__lib__server__gpu__background-analyzer]]"]
same: ["[[Clusters/cluster-17]]","[[Clusters/cluster-22]]","[[Clusters/cluster-0]]","[[Clusters/cluster-16]]","[[Clusters/cluster-42]]"]
tags: ["cluster","cluster/49","topic/topic_vector"]
---

# type chunks in `src/lib/server/cache` (tag: vector)
## For future Claude
> Cluster of 2 files. Top dirs: src/lib/server/cache, src/lib/server/gpu. Top tags: vector, embedding, cache. Risk: medium.
cluster:: cluster-49
cluster_id:: 49
member_count:: 2
pagerank_sum:: 0
risk:: medium
top_tags:: vector, embedding, cache, redis
## Agent hints
Use this cluster when investigating vector, embedding, cache.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-17]] (jaccard 0.80)
- same:: [[Clusters/cluster-22]] (jaccard 0.80)
- same:: [[Clusters/cluster-0]] (jaccard 0.75)
- same:: [[Clusters/cluster-16]] (jaccard 0.75)
- same:: [[Clusters/cluster-42]] (jaccard 0.75)
## Top Directories
- `src/lib/server/cache` (1)
- `src/lib/server/gpu` (1)
## Top Tags
- vector (2)
- embedding (2)
- cache (1)
- redis (1)
## Members (2)
- contains:: [[Files/src__lib__server__cache__cartridge-tensor-bridge|src/lib/server/cache/cartridge-tensor-bridge.ts]]
- contains:: [[Files/src__lib__server__gpu__background-analyzer|src/lib/server/gpu/background-analyzer.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 49 SORT pagerank DESC LIMIT 30
```