---
type: "cluster"
cluster_id: "cluster-83"
clusterId: 83
topic: "const chunks in `src/routes/(app)/admin/dev-tools` (tag: page-server)"
aliases: ["cluster-83","const chunks in `src/routes/(app)/admin/dev-tools` (tag: page-server)"]
memberCount: 154
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["page-server","ssr","embedding","vector","redis"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__routes___app___admin__dev-tools___page]]","[[Files/src__routes___app___cases___id___ai___page.server]]","[[Files/src__routes___app___admin__knowledge-search___page.server]]","[[Files/src__routes___analysis____layout.server]]","[[Files/src__routes___app___cases___id___canvas___page.server]]","[[Files/src__routes__login___page.server]]","[[Files/src__routes___app___demos__agentic-errors__analysis___page.server]]","[[Files/src__routes___app___admin__search-intelligence___page.server]]"]
same: ["[[Clusters/cluster-0]]","[[Clusters/cluster-16]]","[[Clusters/cluster-42]]","[[Clusters/cluster-62]]","[[Clusters/cluster-46]]"]
tags: ["cluster","cluster/83"]
---

# const chunks in `src/routes/(app)/admin/dev-tools` (tag: page-server)
## For future Claude
> Cluster of 8 files. Top dirs: src/routes/(app)/admin/dev-tools, src/routes/(app)/cases/[id]/ai, src/routes/(app)/admin/knowledge-search. Top tags: page-server, ssr, embedding. Risk: medium.
cluster:: cluster-83
cluster_id:: 83
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: page-server, ssr, embedding, vector, redis
## Agent hints
Use this cluster when investigating page-server, ssr, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-0]] (jaccard 0.60)
- same:: [[Clusters/cluster-16]] (jaccard 0.60)
- same:: [[Clusters/cluster-42]] (jaccard 0.60)
- same:: [[Clusters/cluster-62]] (jaccard 0.60)
- same:: [[Clusters/cluster-46]] (jaccard 0.50)
## Top Directories
- `src/routes/(app)/admin/dev-tools` (1)
- `src/routes/(app)/cases/[id]/ai` (1)
- `src/routes/(app)/admin/knowledge-search` (1)
## Top Tags
- page-server (13)
- ssr (13)
- embedding (4)
- vector (3)
- redis (2)
## Members (8)
- contains:: [[Files/src__routes___app___admin__dev-tools___page|src/routes/(app)/admin/dev-tools/+page.svelte]]
- contains:: [[Files/src__routes___app___cases___id___ai___page.server|src/routes/(app)/cases/[id]/ai/+page.server.ts]]
- contains:: [[Files/src__routes___app___admin__knowledge-search___page.server|src/routes/(app)/admin/knowledge-search/+page.server.ts]]
- contains:: [[Files/src__routes___analysis____layout.server|src/routes/(analysis)@/+layout.server.ts]]
- contains:: [[Files/src__routes___app___cases___id___canvas___page.server|src/routes/(app)/cases/[id]/canvas/+page.server.ts]]
- contains:: [[Files/src__routes__login___page.server|src/routes/login/+page.server.ts]]
- contains:: [[Files/src__routes___app___demos__agentic-errors__analysis___page.server|src/routes/(app)/demos/agentic-errors/analysis/+page.server.ts]]
- contains:: [[Files/src__routes___app___admin__search-intelligence___page.server|src/routes/(app)/admin/search-intelligence/+page.server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 83 SORT pagerank DESC LIMIT 30
```