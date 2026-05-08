---
type: "cluster"
cluster_id: "cluster-76"
clusterId: 76
topic: "type chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-76","type chunks in `src/lib/server/db` (tag: database)"]
memberCount: 1
pagerank_sum: 0.431474
pagerank_max: 0.431474
risk: "high"
top_tags: ["database","schema","drizzle","vector","redis"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema-postgres]]"]
same: ["[[Clusters/cluster-51]]","[[Clusters/cluster-65]]","[[Clusters/cluster-53]]","[[Clusters/cluster-55]]","[[Clusters/cluster-60]]"]
tags: ["cluster","cluster/76"]
---

# type chunks in `src/lib/server/db` (tag: database)
## For future Claude
> Cluster of 1 files. Top dirs: src/lib/server/db. Top tags: database, schema, drizzle. Risk: high.
cluster:: cluster-76
cluster_id:: 76
member_count:: 1
pagerank_sum:: 0.431474
risk:: high
top_tags:: database, schema, drizzle, vector, redis
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **high** (pagerank_max=0.431474, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-51]] (jaccard 1.00)
- same:: [[Clusters/cluster-65]] (jaccard 1.00)
- same:: [[Clusters/cluster-53]] (jaccard 0.67)
- same:: [[Clusters/cluster-55]] (jaccard 0.67)
- same:: [[Clusters/cluster-60]] (jaccard 0.67)
## Top Directories
- `src/lib/server/db` (1)
## Top Tags
- database (1)
- schema (1)
- drizzle (1)
- vector (1)
- redis (1)
## Members (1)
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 76 SORT pagerank DESC LIMIT 30
```