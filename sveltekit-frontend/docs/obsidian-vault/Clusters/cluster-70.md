---
type: "cluster"
cluster_id: "cluster-70"
clusterId: 70
topic: "route-handler chunks in `src/lib/server/analytics` (tag: embedding)"
aliases: ["cluster-70","route-handler chunks in `src/lib/server/analytics` (tag: embedding)"]
memberCount: 1546
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["embedding","api","server","vector","redis"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__routes__api__library__crawl___server]]","[[Files/src__routes__api__admin__seed-knowledge___server]]","[[Files/src__lib__server__analytics__agentic-web-indexer]]","[[Files/src__lib__server__graph__pg-neo4j-sync]]","[[Files/src__lib__server__tools__handlers__crawldocs]]","[[Files/src__routes__api__analytics__research-summaries___server]]","[[Files/src__routes__api__codebase-index__gpu-pipeline___server]]","[[Files/src__lib__server__tools__handlers__kbsearch]]"]
same: ["[[Clusters/cluster-25]]","[[Clusters/cluster-85]]","[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-80]]"]
tags: ["cluster","cluster/70","topic/analytics","topic/routes"]
---

# route-handler chunks in `src/lib/server/analytics` (tag: embedding)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/analytics, src/lib/server/tools/handlers, src/routes/api/library/crawl. Top tags: embedding, api, server. Risk: medium.
cluster:: cluster-70
cluster_id:: 70
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: embedding, api, server, vector, redis
## Agent hints
Use this cluster when investigating embedding, api, server.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-25]] (jaccard 1.00)
- same:: [[Clusters/cluster-85]] (jaccard 1.00)
- same:: [[Clusters/cluster-26]] (jaccard 0.80)
- same:: [[Clusters/cluster-31]] (jaccard 0.80)
- same:: [[Clusters/cluster-80]] (jaccard 0.80)
## Top Directories
- `src/lib/server/analytics` (2)
- `src/lib/server/tools/handlers` (2)
- `src/routes/api/library/crawl` (1)
## Top Tags
- embedding (11)
- api (8)
- server (8)
- vector (7)
- redis (6)
## Members (8)
- contains:: [[Files/src__routes__api__library__crawl___server|src/routes/api/library/crawl/+server.ts]]
- contains:: [[Files/src__routes__api__admin__seed-knowledge___server|src/routes/api/admin/seed-knowledge/+server.ts]]
- contains:: [[Files/src__lib__server__analytics__agentic-web-indexer|src/lib/server/analytics/agentic-web-indexer.ts]]
- contains:: [[Files/src__lib__server__graph__pg-neo4j-sync|src/lib/server/graph/pg-neo4j-sync.ts]]
- contains:: [[Files/src__lib__server__tools__handlers__crawldocs|src/lib/server/tools/handlers/crawlDocs.ts]]
- contains:: [[Files/src__routes__api__analytics__research-summaries___server|src/routes/api/analytics/research-summaries/+server.ts]]
- contains:: [[Files/src__routes__api__codebase-index__gpu-pipeline___server|src/routes/api/codebase-index/gpu-pipeline/+server.ts]]
- contains:: [[Files/src__lib__server__tools__handlers__kbsearch|src/lib/server/tools/handlers/kbSearch.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 70 SORT pagerank DESC LIMIT 30
```