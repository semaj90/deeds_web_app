---
type: "cluster"
cluster_id: "cluster-94"
clusterId: 94
topic: "function chunks in `src/lib/server/cache` (tag: redis)"
aliases: ["cluster-94","function chunks in `src/lib/server/cache` (tag: redis)"]
memberCount: 921
pagerank_sum: 0.218228
pagerank_max: 0.218228
risk: "high"
top_tags: ["redis","cache","api","server","embedding"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__routes__api__v1__redis__cache___server]]","[[Files/src__lib__server__cache__pdf-export-cache]]","[[Files/src__lib__server__cache]]","[[Files/src__lib__cache__indexdb-cache.svelte]]","[[Files/src__lib__server__cache__report-template-cache]]","[[Files/src__lib__cache__cache-service.svelte]]","[[Files/src__lib__server__research__lane4-feedback]]","[[Files/src__lib__server__vector-cache]]"]
same: ["[[Clusters/cluster-25]]","[[Clusters/cluster-70]]","[[Clusters/cluster-85]]","[[Clusters/cluster-26]]","[[Clusters/cluster-31]]"]
tags: ["cluster","cluster/94","topic/sym_get"]
---

# function chunks in `src/lib/server/cache` (tag: redis)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/cache, src/lib/server, src/lib/cache. Top tags: redis, cache, api. Risk: high.
cluster:: cluster-94
cluster_id:: 94
member_count:: 8
pagerank_sum:: 0.218228
risk:: high
top_tags:: redis, cache, api, server, embedding
## Agent hints
Use this cluster when investigating redis, cache, api.
Risk: **high** (pagerank_max=0.218228, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-25]] (jaccard 0.67)
- same:: [[Clusters/cluster-70]] (jaccard 0.67)
- same:: [[Clusters/cluster-85]] (jaccard 0.67)
- same:: [[Clusters/cluster-26]] (jaccard 0.50)
- same:: [[Clusters/cluster-31]] (jaccard 0.50)
## Top Directories
- `src/lib/server/cache` (5)
- `src/lib/server` (4)
- `src/lib/cache` (2)
## Top Tags
- redis (12)
- cache (9)
- api (1)
- server (1)
- embedding (1)
## Members (8)
- contains:: [[Files/src__routes__api__v1__redis__cache___server|src/routes/api/v1/redis/cache/+server.ts]]
- contains:: [[Files/src__lib__server__cache__pdf-export-cache|src/lib/server/cache/pdf-export-cache.ts]]
- contains:: [[Files/src__lib__server__cache|src/lib/server/cache.ts]]
- contains:: [[Files/src__lib__cache__indexdb-cache.svelte|src/lib/cache/indexdb-cache.svelte.ts]]
- contains:: [[Files/src__lib__server__cache__report-template-cache|src/lib/server/cache/report-template-cache.ts]]
- contains:: [[Files/src__lib__cache__cache-service.svelte|src/lib/cache/cache-service.svelte.ts]]
- contains:: [[Files/src__lib__server__research__lane4-feedback|src/lib/server/research/lane4-feedback.ts]]
- contains:: [[Files/src__lib__server__vector-cache|src/lib/server/vector-cache.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 94 SORT pagerank DESC LIMIT 30
```