---
type: "cluster"
cluster_id: "cluster-80"
clusterId: 80
topic: "function chunks in `src/lib/server/gpu` (tag: vector)"
aliases: ["cluster-80","function chunks in `src/lib/server/gpu` (tag: vector)"]
memberCount: 285
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["vector","embedding","api","server"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__gpu__background-analyzer]]","[[Files/src__routes__api__persons-of-interest___id___gpu-analyze___server]]"]
same: ["[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-25]]","[[Clusters/cluster-44]]","[[Clusters/cluster-69]]"]
tags: ["cluster","cluster/80","topic/topic_vector","topic/routes"]
---

# function chunks in `src/lib/server/gpu` (tag: vector)
## For future Claude
> Cluster of 2 files. Top dirs: src/lib/server/gpu, src/routes/api/persons-of-interest/[id]/gpu-analyze. Top tags: vector, embedding, api. Risk: medium.
cluster:: cluster-80
cluster_id:: 80
member_count:: 2
pagerank_sum:: 0
risk:: medium
top_tags:: vector, embedding, api, server
## Agent hints
Use this cluster when investigating vector, embedding, api.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-26]] (jaccard 1.00)
- same:: [[Clusters/cluster-31]] (jaccard 1.00)
- same:: [[Clusters/cluster-25]] (jaccard 0.80)
- same:: [[Clusters/cluster-44]] (jaccard 0.80)
- same:: [[Clusters/cluster-69]] (jaccard 0.80)
## Top Directories
- `src/lib/server/gpu` (2)
- `src/routes/api/persons-of-interest/[id]/gpu-analyze` (1)
## Top Tags
- vector (2)
- embedding (2)
- api (1)
- server (1)
## Members (2)
- contains:: [[Files/src__lib__server__gpu__background-analyzer|src/lib/server/gpu/background-analyzer.ts]]
- contains:: [[Files/src__routes__api__persons-of-interest___id___gpu-analyze___server|src/routes/api/persons-of-interest/[id]/gpu-analyze/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 80 SORT pagerank DESC LIMIT 30
```