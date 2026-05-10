---
type: "cluster"
cluster_id: "cluster-47"
clusterId: 47
topic: "route-handler chunks in `src/lib/server/legal` (tag: api)"
aliases: ["cluster-47","route-handler chunks in `src/lib/server/legal` (tag: api)"]
memberCount: 339
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["api","server","page-server","ssr","api-route"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__routes___app___library__corpus___page.server]]","[[Files/src__routes___app___legal-corpus___page.server]]","[[Files/src__lib__server__legal__constitution-fetcher]]","[[Files/src__routes___app___citations__law___citation____page.server]]","[[Files/src__lib__server__legal__html-normalizer]]","[[Files/src__routes___app___legal-corpus___id____page.server]]","[[Files/src__routes__api__library__corpus__constitutions___server]]","[[Files/src__lib__server__legal__law-citations]]"]
same: ["[[Clusters/cluster-8]]","[[Clusters/cluster-64]]","[[Clusters/cluster-90]]"]
tags: ["cluster","cluster/47","topic/legal","topic/corpus","topic/sym_load","topic/routes","topic/topic_legal"]
---

# route-handler chunks in `src/lib/server/legal` (tag: api)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/legal, src/routes/api/library/corpus/constitutions, src/routes/(app)/library/corpus. Top tags: api, server, page-server. Risk: medium.
cluster:: cluster-47
cluster_id:: 47
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: api, server, page-server, ssr, api-route
## Agent hints
Use this cluster when investigating api, server, page-server.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-8]] (jaccard 0.67)
- same:: [[Clusters/cluster-64]] (jaccard 0.40)
- same:: [[Clusters/cluster-90]] (jaccard 0.33)
## Top Directories
- `src/lib/server/legal` (5)
- `src/routes/api/library/corpus/constitutions` (2)
- `src/routes/(app)/library/corpus` (1)
## Top Tags
- api (6)
- server (6)
- page-server (4)
- ssr (4)
- api-route (1)
## Members (8)
- contains:: [[Files/src__routes___app___library__corpus___page.server|src/routes/(app)/library/corpus/+page.server.ts]]
- contains:: [[Files/src__routes___app___legal-corpus___page.server|src/routes/(app)/legal-corpus/+page.server.ts]]
- contains:: [[Files/src__lib__server__legal__constitution-fetcher|src/lib/server/legal/constitution-fetcher.ts]]
- contains:: [[Files/src__routes___app___citations__law___citation____page.server|src/routes/(app)/citations/law/[citation]/+page.server.ts]]
- contains:: [[Files/src__lib__server__legal__html-normalizer|src/lib/server/legal/html-normalizer.ts]]
- contains:: [[Files/src__routes___app___legal-corpus___id____page.server|src/routes/(app)/legal-corpus/[id]/+page.server.ts]]
- contains:: [[Files/src__routes__api__library__corpus__constitutions___server|src/routes/api/library/corpus/constitutions/+server.ts]]
- contains:: [[Files/src__lib__server__legal__law-citations|src/lib/server/legal/law-citations.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 47 SORT pagerank DESC LIMIT 30
```