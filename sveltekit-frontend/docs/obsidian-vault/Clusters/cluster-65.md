---
type: "cluster"
cluster_id: "cluster-65"
clusterId: 65
topic: "const chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-65","const chunks in `src/lib/server/db` (tag: database)"]
memberCount: 1
pagerank_sum: 0.431474
pagerank_max: 0.431474
risk: "medium"
top_tags: ["database","schema","drizzle","vector","redis"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema-postgres]]"]
same: ["[[Clusters/cluster-51]]","[[Clusters/cluster-76]]","[[Clusters/cluster-53]]","[[Clusters/cluster-55]]","[[Clusters/cluster-60]]"]
tags: ["cluster","cluster/65"]
---

# const chunks in `src/lib/server/db` (tag: database)
## For future Claude
> This cluster contains utility functions and components for advanced AI processing, database interaction, and frontend UI component management, alongside core policy and state management logic.

**Purpose:** Utility and Component Library
cluster:: cluster-65
cluster_id:: 65
member_count:: 1
pagerank_sum:: 0.431474
risk:: medium
top_tags:: database, schema, drizzle, vector, redis
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **medium** (pagerank_max=0.431474, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-51]] (jaccard 1.00)
- same:: [[Clusters/cluster-76]] (jaccard 1.00)
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
LIST FROM "Files" WHERE clusterId = 65 SORT pagerank DESC LIMIT 30
```