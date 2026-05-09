---
type: "cluster"
cluster_id: "cluster-68"
clusterId: 68
topic: "function chunks in `src/lib/stores/dashboard` (tag: server-module)"
aliases: ["cluster-68","function chunks in `src/lib/stores/dashboard` (tag: server-module)"]
memberCount: 2
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["server-module","sse"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__stores__dashboard__grpcstatusadapter]]"]
same: ["[[Clusters/cluster-23]]"]
tags: ["cluster","cluster/68","topic/stores","topic/topic_stores","topic/sym_get"]
---

# function chunks in `src/lib/stores/dashboard` (tag: server-module)
## For future Claude
> Cluster of 1 files. Top dirs: src/lib/stores/dashboard. Top tags: server-module, sse. Risk: medium.
cluster:: cluster-68
cluster_id:: 68
member_count:: 1
pagerank_sum:: 0
risk:: medium
top_tags:: server-module, sse
## Agent hints
Use this cluster when investigating server-module, sse.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-23]] (jaccard 0.40)
## Top Directories
- `src/lib/stores/dashboard` (2)
## Top Tags
- server-module (1)
- sse (1)
## Members (1)
- contains:: [[Files/src__lib__stores__dashboard__grpcstatusadapter|src/lib/stores/dashboard/GrpcStatusAdapter.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 68 SORT pagerank DESC LIMIT 30
```