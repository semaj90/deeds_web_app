---
type: "cluster"
cluster_id: "cluster-60"
clusterId: 60
topic: "function chunks in `src/lib/server/analytics` (tag: embedding)"
aliases: ["cluster-60","function chunks in `src/lib/server/analytics` (tag: embedding)"]
memberCount: 406
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["embedding","redis","vector","database","schema"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__analytics__search-analytics]]","[[Files/src__lib__server__db__schema__search-analytics]]","[[Files/src__lib__db__schema__ace-web]]","[[Files/src__lib__server__indexer__karpathy-wiki]]","[[Files/src__lib__types__pipeline-v2]]"]
same: ["[[Clusters/cluster-20]]","[[Clusters/cluster-51]]","[[Clusters/cluster-53]]","[[Clusters/cluster-55]]","[[Clusters/cluster-65]]"]
tags: ["cluster","cluster/60"]
---

# function chunks in `src/lib/server/analytics` (tag: embedding)
## For future Claude
> Cluster of 5 files. Top dirs: src/lib/server/analytics, src/lib/server/db/schema, src/lib/db/schema. Top tags: embedding, redis, vector. Risk: medium.
cluster:: cluster-60
cluster_id:: 60
member_count:: 5
pagerank_sum:: 0
risk:: medium
top_tags:: embedding, redis, vector, database, schema
## Agent hints
Use this cluster when investigating embedding, redis, vector.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-20]] (jaccard 0.67)
- same:: [[Clusters/cluster-51]] (jaccard 0.67)
- same:: [[Clusters/cluster-53]] (jaccard 0.67)
- same:: [[Clusters/cluster-55]] (jaccard 0.67)
- same:: [[Clusters/cluster-65]] (jaccard 0.67)
## Top Directories
- `src/lib/server/analytics` (4)
- `src/lib/server/db/schema` (2)
- `src/lib/db/schema` (1)
## Top Tags
- embedding (8)
- redis (6)
- vector (5)
- database (4)
- schema (3)
## Members (5)
- contains:: [[Files/src__lib__server__analytics__search-analytics|src/lib/server/analytics/search-analytics.ts]]
- contains:: [[Files/src__lib__server__db__schema__search-analytics|src/lib/server/db/schema/search-analytics.ts]]
- contains:: [[Files/src__lib__db__schema__ace-web|src/lib/db/schema/ace-web.ts]]
- contains:: [[Files/src__lib__server__indexer__karpathy-wiki|src/lib/server/indexer/karpathy-wiki.ts]]
- contains:: [[Files/src__lib__types__pipeline-v2|src/lib/types/pipeline-v2.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 60 SORT pagerank DESC LIMIT 30
```