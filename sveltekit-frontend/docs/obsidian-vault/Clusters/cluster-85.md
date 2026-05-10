---
type: "cluster"
cluster_id: "cluster-85"
clusterId: 85
topic: "route-handler chunks in `src/routes/api/citations/collections/[collectionId]/citations` (tag: api)"
aliases: ["cluster-85","route-handler chunks in `src/routes/api/citations/collections/[collectionId]/citations` (tag: api)"]
memberCount: 587
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["api","server","embedding","redis","vector"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__routes__api__cases___id___notes___noteid___evidence___server]]","[[Files/src__routes__api__fictional-cases___id____server]]","[[Files/src__routes__api__citations__collections___collectionid___citations___server]]","[[Files/src__routes__api__citations___citationid___tags___server]]","[[Files/src__routes__api__error-brain__diagnosis-history___server]]","[[Files/src__routes__api__reports___server]]","[[Files/src__routes__api__citations__collections___collectionid____server]]","[[Files/src__routes__api__citations__export__json___server]]"]
same: ["[[Clusters/cluster-25]]","[[Clusters/cluster-70]]","[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-80]]"]
tags: ["cluster","cluster/85","topic/routes","topic/cases","topic/evidence"]
---

# route-handler chunks in `src/routes/api/citations/collections/[collectionId]/citations` (tag: api)
## For future Claude
> Cluster of 8 files. Top dirs: src/routes/api/citations/collections/[collectionId]/citations, src/routes/api/cases/[id]/notes/[noteId]/evidence, src/routes/api/fictional-cases/[id]. Top tags: api, server, embedding. Risk: medium.
cluster:: cluster-85
cluster_id:: 85
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: api, server, embedding, redis, vector
## Agent hints
Use this cluster when investigating api, server, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-25]] (jaccard 1.00)
- same:: [[Clusters/cluster-70]] (jaccard 1.00)
- same:: [[Clusters/cluster-26]] (jaccard 0.80)
- same:: [[Clusters/cluster-31]] (jaccard 0.80)
- same:: [[Clusters/cluster-80]] (jaccard 0.80)
## Top Directories
- `src/routes/api/citations/collections/[collectionId]/citations` (3)
- `src/routes/api/cases/[id]/notes/[noteId]/evidence` (2)
- `src/routes/api/fictional-cases/[id]` (1)
## Top Tags
- api (15)
- server (15)
- embedding (3)
- redis (2)
- vector (1)
## Members (8)
- contains:: [[Files/src__routes__api__cases___id___notes___noteid___evidence___server|src/routes/api/cases/[id]/notes/[noteId]/evidence/+server.ts]]
- contains:: [[Files/src__routes__api__fictional-cases___id____server|src/routes/api/fictional-cases/[id]/+server.ts]]
- contains:: [[Files/src__routes__api__citations__collections___collectionid___citations___server|src/routes/api/citations/collections/[collectionId]/citations/+server.ts]]
- contains:: [[Files/src__routes__api__citations___citationid___tags___server|src/routes/api/citations/[citationId]/tags/+server.ts]]
- contains:: [[Files/src__routes__api__error-brain__diagnosis-history___server|src/routes/api/error-brain/diagnosis-history/+server.ts]]
- contains:: [[Files/src__routes__api__reports___server|src/routes/api/reports/+server.ts]]
- contains:: [[Files/src__routes__api__citations__collections___collectionid____server|src/routes/api/citations/collections/[collectionId]/+server.ts]]
- contains:: [[Files/src__routes__api__citations__export__json___server|src/routes/api/citations/export/json/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 85 SORT pagerank DESC LIMIT 30
```