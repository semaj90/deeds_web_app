---
type: "cluster"
cluster_id: "cluster-98"
clusterId: 98
topic: "type chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-98","type chunks in `src/lib/server/db` (tag: database)"]
memberCount: 5
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["database","schema","drizzle","auth","embedding"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema-gpu-cache]]"]
same: ["[[Clusters/cluster-10]]","[[Clusters/cluster-13]]","[[Clusters/cluster-88]]","[[Clusters/cluster-91]]","[[Clusters/cluster-95]]"]
tags: ["cluster","cluster/98"]
---

# type chunks in `src/lib/server/db` (tag: database)
## For future Claude
> Cluster of 1 files. Top dirs: src/lib/server/db. Top tags: database, schema, drizzle. Risk: medium.
cluster:: cluster-98
cluster_id:: 98
member_count:: 1
pagerank_sum:: 0
risk:: medium
top_tags:: database, schema, drizzle, auth, embedding
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-10]] (jaccard 1.00)
- same:: [[Clusters/cluster-13]] (jaccard 1.00)
- same:: [[Clusters/cluster-88]] (jaccard 1.00)
- same:: [[Clusters/cluster-91]] (jaccard 1.00)
- same:: [[Clusters/cluster-95]] (jaccard 1.00)
## Top Directories
- `src/lib/server/db` (5)
## Top Tags
- database (5)
- schema (5)
- drizzle (5)
- auth (5)
- embedding (5)
## Members (1)
- contains:: [[Files/src__lib__server__db__schema-gpu-cache|src/lib/server/db/schema-gpu-cache.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 98 SORT pagerank DESC LIMIT 30
```