---
type: "cluster"
cluster_id: "cluster-64"
clusterId: 64
topic: "route-handler chunks in `src/routes/api/error-brain/history/[filePath]` (tag: api)"
aliases: ["cluster-64","route-handler chunks in `src/routes/api/error-brain/history/[filePath]` (tag: api)"]
memberCount: 525
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["api","server"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__routes__api__error-brain__history___filepath____server]]","[[Files/src__routes__api__internal__error-brain__runs___server]]"]
same: ["[[Clusters/cluster-90]]","[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-80]]","[[Clusters/cluster-8]]"]
tags: ["cluster","cluster/64","topic/brain","topic/error","topic/topic_error","topic/routes"]
---

# route-handler chunks in `src/routes/api/error-brain/history/[filePath]` (tag: api)
## For future Claude
> Cluster of 2 files. Top dirs: src/routes/api/error-brain/history/[filePath], src/routes/api/internal/error-brain/runs. Top tags: api, server. Risk: medium.
cluster:: cluster-64
cluster_id:: 64
member_count:: 2
pagerank_sum:: 0
risk:: medium
top_tags:: api, server
## Agent hints
Use this cluster when investigating api, server.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-90]] (jaccard 0.67)
- same:: [[Clusters/cluster-26]] (jaccard 0.50)
- same:: [[Clusters/cluster-31]] (jaccard 0.50)
- same:: [[Clusters/cluster-80]] (jaccard 0.50)
- same:: [[Clusters/cluster-8]] (jaccard 0.40)
## Top Directories
- `src/routes/api/error-brain/history/[filePath]` (1)
- `src/routes/api/internal/error-brain/runs` (1)
## Top Tags
- api (2)
- server (2)
## Members (2)
- contains:: [[Files/src__routes__api__error-brain__history___filepath____server|src/routes/api/error-brain/history/[filePath]/+server.ts]]
- contains:: [[Files/src__routes__api__internal__error-brain__runs___server|src/routes/api/internal/error-brain/runs/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 64 SORT pagerank DESC LIMIT 30
```