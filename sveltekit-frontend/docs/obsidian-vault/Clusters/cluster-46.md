---
type: "cluster"
cluster_id: "cluster-46"
clusterId: 46
topic: "type chunks in `src/lib/server/types` (tag: ai)"
aliases: ["cluster-46","type chunks in `src/lib/server/types` (tag: ai)"]
memberCount: 2
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["ai","vector","redis","embedding"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__types__synthesis]]","[[Files/src__lib__server__ai__langgraph-client]]"]
same: ["[[Clusters/cluster-19]]","[[Clusters/cluster-72]]","[[Clusters/cluster-75]]","[[Clusters/cluster-0]]","[[Clusters/cluster-16]]"]
tags: ["cluster","cluster/46"]
---

# type chunks in `src/lib/server/types` (tag: ai)
## For future Claude
> Cluster of 2 files. Top dirs: src/lib/server/types, src/lib/server/ai. Top tags: ai, vector, redis. Risk: medium.
cluster:: cluster-46
cluster_id:: 46
member_count:: 2
pagerank_sum:: 0
risk:: medium
top_tags:: ai, vector, redis, embedding
## Agent hints
Use this cluster when investigating ai, vector, redis.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-19]] (jaccard 0.80)
- same:: [[Clusters/cluster-72]] (jaccard 0.80)
- same:: [[Clusters/cluster-75]] (jaccard 0.80)
- same:: [[Clusters/cluster-0]] (jaccard 0.75)
- same:: [[Clusters/cluster-16]] (jaccard 0.75)
## Top Directories
- `src/lib/server/types` (1)
- `src/lib/server/ai` (1)
## Top Tags
- ai (1)
- vector (1)
- redis (1)
- embedding (1)
## Members (2)
- contains:: [[Files/src__lib__server__types__synthesis|src/lib/server/types/synthesis.ts]]
- contains:: [[Files/src__lib__server__ai__langgraph-client|src/lib/server/ai/langgraph-client.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 46 SORT pagerank DESC LIMIT 30
```