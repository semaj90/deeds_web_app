---
type: "cluster"
cluster_id: "cluster-69"
clusterId: 69
topic: "route-handler chunks in `src/routes/(app)/admin/api-testing/agentic-loop` (tag: api)"
aliases: ["cluster-69","route-handler chunks in `src/routes/(app)/admin/api-testing/agentic-loop` (tag: api)"]
memberCount: 256
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["api","server","vector","embedding","xstate"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__routes__api__codebase-index__recommendations___server]]","[[Files/src__routes__api__codebase-index__cluster-detect___server]]","[[Files/src__routes___app___admin__api-testing__agentic-loop___server]]","[[Files/src__routes__api__ml__cluster-status___server]]","[[Files/src__lib__server__ml__topic-clustering-worker]]"]
same: ["[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-80]]","[[Clusters/cluster-25]]","[[Clusters/cluster-44]]"]
tags: ["cluster","cluster/69","topic/routes","topic/sym_job"]
---

# route-handler chunks in `src/routes/(app)/admin/api-testing/agentic-loop` (tag: api)
## For future Claude
> Cluster of 5 files. Top dirs: src/routes/(app)/admin/api-testing/agentic-loop, src/routes/api/codebase-index/recommendations, src/routes/api/codebase-index/cluster-detect. Top tags: api, server, vector. Risk: medium.
cluster:: cluster-69
cluster_id:: 69
member_count:: 5
pagerank_sum:: 0
risk:: medium
top_tags:: api, server, vector, embedding, xstate
## Agent hints
Use this cluster when investigating api, server, vector.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-26]] (jaccard 0.80)
- same:: [[Clusters/cluster-31]] (jaccard 0.80)
- same:: [[Clusters/cluster-80]] (jaccard 0.80)
- same:: [[Clusters/cluster-25]] (jaccard 0.67)
- same:: [[Clusters/cluster-44]] (jaccard 0.67)
## Top Directories
- `src/routes/(app)/admin/api-testing/agentic-loop` (2)
- `src/routes/api/codebase-index/recommendations` (1)
- `src/routes/api/codebase-index/cluster-detect` (1)
## Top Tags
- api (5)
- server (5)
- vector (5)
- embedding (5)
- xstate (1)
## Members (5)
- contains:: [[Files/src__routes__api__codebase-index__recommendations___server|src/routes/api/codebase-index/recommendations/+server.ts]]
- contains:: [[Files/src__routes__api__codebase-index__cluster-detect___server|src/routes/api/codebase-index/cluster-detect/+server.ts]]
- contains:: [[Files/src__routes___app___admin__api-testing__agentic-loop___server|src/routes/(app)/admin/api-testing/agentic-loop/+server.ts]]
- contains:: [[Files/src__routes__api__ml__cluster-status___server|src/routes/api/ml/cluster-status/+server.ts]]
- contains:: [[Files/src__lib__server__ml__topic-clustering-worker|src/lib/server/ml/topic-clustering-worker.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 69 SORT pagerank DESC LIMIT 30
```