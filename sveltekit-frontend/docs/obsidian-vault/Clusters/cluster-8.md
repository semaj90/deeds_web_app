---
type: "cluster"
cluster_id: "cluster-8"
clusterId: 8
topic: "route-handler chunks in `src/routes/api/library/documents/[documentId]/toc` (tag: api)"
aliases: ["cluster-8","route-handler chunks in `src/routes/api/library/documents/[documentId]/toc` (tag: api)"]
memberCount: 136
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["api","server","page-server","ssr","vector"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__routes__api__library__documents___documentid___toc___server]]","[[Files/src__routes__api__library__document___id____server]]","[[Files/src__routes__api__library__document___id___node___nodeid____server]]","[[Files/src__routes__api__knowledge__document___id____server]]","[[Files/src__routes__api__library__document___id___toc___server]]","[[Files/src__routes___app___library___documentid___reader___page.server]]","[[Files/src__routes__api__library__documents___documentid___pdf___server]]","[[Files/src__routes___app___library___documentid___node___nodeid____page.server]]"]
same: ["[[Clusters/cluster-47]]","[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-80]]","[[Clusters/cluster-25]]"]
tags: ["cluster","cluster/8","topic/routes","topic/sym_load"]
---

# route-handler chunks in `src/routes/api/library/documents/[documentId]/toc` (tag: api)
## For future Claude
> This cluster provides a comprehensive set of API route handlers responsible for managing core application features, including document access, user profiles, knowledge base indexing, and complex data retrieval like conversation history and RAG suggestions.

**Purpose:** API Gateway / Backend Service Layer
cluster:: cluster-8
cluster_id:: 8
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: api, server, page-server, ssr, vector
## Agent hints
Use this cluster when investigating api, server, page-server.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-47]] (jaccard 0.67)
- same:: [[Clusters/cluster-26]] (jaccard 0.50)
- same:: [[Clusters/cluster-31]] (jaccard 0.50)
- same:: [[Clusters/cluster-80]] (jaccard 0.50)
- same:: [[Clusters/cluster-25]] (jaccard 0.43)
## Top Directories
- `src/routes/api/library/documents/[documentId]/toc` (1)
- `src/routes/api/library/document/[id]` (1)
- `src/routes/api/library/document/[id]/node/[nodeId]` (1)
## Top Tags
- api (13)
- server (13)
- page-server (3)
- ssr (3)
- vector (2)
## Members (8)
- contains:: [[Files/src__routes__api__library__documents___documentid___toc___server|src/routes/api/library/documents/[documentId]/toc/+server.ts]]
- contains:: [[Files/src__routes__api__library__document___id____server|src/routes/api/library/document/[id]/+server.ts]]
- contains:: [[Files/src__routes__api__library__document___id___node___nodeid____server|src/routes/api/library/document/[id]/node/[nodeId]/+server.ts]]
- contains:: [[Files/src__routes__api__knowledge__document___id____server|src/routes/api/knowledge/document/[id]/+server.ts]]
- contains:: [[Files/src__routes__api__library__document___id___toc___server|src/routes/api/library/document/[id]/toc/+server.ts]]
- contains:: [[Files/src__routes___app___library___documentid___reader___page.server|src/routes/(app)/library/[documentId]/reader/+page.server.ts]]
- contains:: [[Files/src__routes__api__library__documents___documentid___pdf___server|src/routes/api/library/documents/[documentId]/pdf/+server.ts]]
- contains:: [[Files/src__routes___app___library___documentid___node___nodeid____page.server|src/routes/(app)/library/[documentId]/node/[nodeId]/+page.server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 8 SORT pagerank DESC LIMIT 30
```