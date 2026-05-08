---
type: "cluster"
cluster_id: "cluster-27"
clusterId: 27
topic: "route-handler chunks in `src/routes/api/conversations/[id]` (tag: api)"
aliases: ["cluster-27","route-handler chunks in `src/routes/api/conversations/[id]` (tag: api)"]
memberCount: 277
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["api","server","redis","database","vector"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__routes__api__conversations___id____server]]","[[Files/src__routes__api__auth__profile___server]]","[[Files/src__routes__api__error-brain__diagnosis-history___server]]","[[Files/src__routes__api__evidence___id___approve___server]]","[[Files/src__routes__api__routes___routeid___error-brain-patch___server]]","[[Files/src__routes__api__evidence__summary___id___approve___server]]","[[Files/src__routes__api__cases___id___notes___noteid____server]]","[[Files/src__routes__api__persons-of-interest___id____server]]"]
same: ["[[Clusters/cluster-25]]","[[Clusters/cluster-70]]","[[Clusters/cluster-85]]","[[Clusters/cluster-26]]","[[Clusters/cluster-31]]"]
tags: ["cluster","cluster/27"]
---

# route-handler chunks in `src/routes/api/conversations/[id]` (tag: api)
## For future Claude
> Cluster of 8 files. Top dirs: src/routes/api/conversations/[id], src/routes/api/auth/profile, src/routes/api/error-brain/diagnosis-history. Top tags: api, server, redis. Risk: medium.
cluster:: cluster-27
cluster_id:: 27
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: api, server, redis, database, vector
## Agent hints
Use this cluster when investigating api, server, redis.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-25]] (jaccard 0.67)
- same:: [[Clusters/cluster-70]] (jaccard 0.67)
- same:: [[Clusters/cluster-85]] (jaccard 0.67)
- same:: [[Clusters/cluster-26]] (jaccard 0.50)
- same:: [[Clusters/cluster-31]] (jaccard 0.50)
## Top Directories
- `src/routes/api/conversations/[id]` (1)
- `src/routes/api/auth/profile` (1)
- `src/routes/api/error-brain/diagnosis-history` (1)
## Top Tags
- api (15)
- server (15)
- redis (3)
- database (1)
- vector (1)
## Members (8)
- contains:: [[Files/src__routes__api__conversations___id____server|src/routes/api/conversations/[id]/+server.ts]]
- contains:: [[Files/src__routes__api__auth__profile___server|src/routes/api/auth/profile/+server.ts]]
- contains:: [[Files/src__routes__api__error-brain__diagnosis-history___server|src/routes/api/error-brain/diagnosis-history/+server.ts]]
- contains:: [[Files/src__routes__api__evidence___id___approve___server|src/routes/api/evidence/[id]/approve/+server.ts]]
- contains:: [[Files/src__routes__api__routes___routeid___error-brain-patch___server|src/routes/api/routes/[routeId]/error-brain-patch/+server.ts]]
- contains:: [[Files/src__routes__api__evidence__summary___id___approve___server|src/routes/api/evidence/summary/[id]/approve/+server.ts]]
- contains:: [[Files/src__routes__api__cases___id___notes___noteid____server|src/routes/api/cases/[id]/notes/[noteId]/+server.ts]]
- contains:: [[Files/src__routes__api__persons-of-interest___id____server|src/routes/api/persons-of-interest/[id]/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 27 SORT pagerank DESC LIMIT 30
```