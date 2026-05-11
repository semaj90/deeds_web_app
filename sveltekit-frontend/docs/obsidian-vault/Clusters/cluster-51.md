---
type: "cluster"
cluster_id: "cluster-51"
clusterId: 51
topic: "table-def chunks in `src/lib/db/schema` (tag: database)"
aliases: ["cluster-51","table-def chunks in `src/lib/db/schema` (tag: database)"]
memberCount: 100
pagerank_sum: 0.431474
pagerank_max: 0.431474
risk: "high"
top_tags: ["database","schema","drizzle","vector","redis"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__db__schema__evidence]]","[[Files/src__lib__server__db__schema-postgres]]"]
same: ["[[Clusters/cluster-65]]","[[Clusters/cluster-76]]","[[Clusters/cluster-53]]","[[Clusters/cluster-55]]","[[Clusters/cluster-60]]"]
tags: ["cluster","cluster/51"]
---

# table-def chunks in `src/lib/db/schema` (tag: database)
## For future Claude
> Cluster of 2 files. Top dirs: src/lib/db/schema, src/lib/server/db. Top tags: database, schema, drizzle. Risk: high.
cluster:: cluster-51
cluster_id:: 51
member_count:: 2
pagerank_sum:: 0.431474
risk:: high
top_tags:: database, schema, drizzle, vector, redis
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **high** (pagerank_max=0.431474, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-65]] (jaccard 1.00)
- same:: [[Clusters/cluster-76]] (jaccard 1.00)
- same:: [[Clusters/cluster-53]] (jaccard 0.67)
- same:: [[Clusters/cluster-55]] (jaccard 0.67)
- same:: [[Clusters/cluster-60]] (jaccard 0.67)
## Top Directories
- `src/lib/db/schema` (2)
- `src/lib/server/db` (1)
## Top Tags
- database (3)
- schema (3)
- drizzle (3)
- vector (1)
- redis (1)
## Members (2)
- contains:: [[Files/src__lib__db__schema__evidence|src/lib/db/schema/evidence.ts]]
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 51 SORT pagerank DESC LIMIT 30
```