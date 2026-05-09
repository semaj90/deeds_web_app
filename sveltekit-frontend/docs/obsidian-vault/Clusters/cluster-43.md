---
type: "cluster"
cluster_id: "cluster-43"
clusterId: 43
topic: "type chunks in `src/lib/services/knowledge-search` (tag: embedding)"
aliases: ["cluster-43","type chunks in `src/lib/services/knowledge-search` (tag: embedding)"]
memberCount: 124
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["embedding","vector","api-route","types","server-module"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__services__knowledge-search__types]]","[[Files/src__lib__server__research__reddit-harvester]]","[[Files/src__lib__server__rag__rag-types]]","[[Files/src__lib__server__utils__vector-schemas]]","[[Files/src__lib__types__rag]]","[[Files/src__lib__server__validation__query-params]]","[[Files/src__lib__server__research__github-harvester]]","[[Files/src__lib__services__api-client]]"]
same: ["[[Clusters/cluster-23]]","[[Clusters/cluster-78]]","[[Clusters/cluster-9]]","[[Clusters/cluster-56]]","[[Clusters/cluster-17]]"]
tags: ["cluster","cluster/43"]
---

# type chunks in `src/lib/services/knowledge-search` (tag: embedding)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/services/knowledge-search, src/lib/server/research, src/lib/server/rag. Top tags: embedding, vector, api-route. Risk: medium.
cluster:: cluster-43
cluster_id:: 43
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: embedding, vector, api-route, types, server-module
## Agent hints
Use this cluster when investigating embedding, vector, api-route.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-23]] (jaccard 0.67)
- same:: [[Clusters/cluster-78]] (jaccard 0.67)
- same:: [[Clusters/cluster-9]] (jaccard 0.50)
- same:: [[Clusters/cluster-56]] (jaccard 0.50)
- same:: [[Clusters/cluster-17]] (jaccard 0.43)
## Top Directories
- `src/lib/services/knowledge-search` (2)
- `src/lib/server/research` (2)
- `src/lib/server/rag` (2)
## Top Tags
- embedding (8)
- vector (6)
- api-route (3)
- types (2)
- server-module (2)
## Members (8)
- contains:: [[Files/src__lib__services__knowledge-search__types|src/lib/services/knowledge-search/types.ts]]
- contains:: [[Files/src__lib__server__research__reddit-harvester|src/lib/server/research/reddit-harvester.ts]]
- contains:: [[Files/src__lib__server__rag__rag-types|src/lib/server/rag/rag-types.ts]]
- contains:: [[Files/src__lib__server__utils__vector-schemas|src/lib/server/utils/vector-schemas.ts]]
- contains:: [[Files/src__lib__types__rag|src/lib/types/rag.ts]]
- contains:: [[Files/src__lib__server__validation__query-params|src/lib/server/validation/query-params.ts]]
- contains:: [[Files/src__lib__server__research__github-harvester|src/lib/server/research/github-harvester.ts]]
- contains:: [[Files/src__lib__services__api-client|src/lib/services/api-client.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 43 SORT pagerank DESC LIMIT 30
```