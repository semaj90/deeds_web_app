---
type: "cluster"
cluster_id: "cluster-10"
clusterId: 10
topic: "type chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-10","type chunks in `src/lib/server/db` (tag: database)"]
memberCount: 1
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["database","schema","drizzle","auth","embedding"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema-gpu-cache]]"]
same: ["[[Clusters/cluster-13]]","[[Clusters/cluster-88]]","[[Clusters/cluster-91]]","[[Clusters/cluster-95]]","[[Clusters/cluster-98]]"]
tags: ["cluster","cluster/10","topic/auth"]
---

# type chunks in `src/lib/server/db` (tag: database)
## For future Claude
> This cluster provides a collection of TypeScript type definitions that mirror the structure of various database tables, ensuring strong type safety across the application's data access layer.

**Purpose:** Database Schema Type Definitions
cluster:: cluster-10
cluster_id:: 10
member_count:: 1
pagerank_sum:: 0
risk:: low
top_tags:: database, schema, drizzle, auth, embedding
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-13]] (jaccard 1.00)
- same:: [[Clusters/cluster-88]] (jaccard 1.00)
- same:: [[Clusters/cluster-91]] (jaccard 1.00)
- same:: [[Clusters/cluster-95]] (jaccard 1.00)
- same:: [[Clusters/cluster-98]] (jaccard 1.00)
## Top Directories
- `src/lib/server/db` (1)
## Top Tags
- database (1)
- schema (1)
- drizzle (1)
- auth (1)
- embedding (1)
## Members (1)
- contains:: [[Files/src__lib__server__db__schema-gpu-cache|src/lib/server/db/schema-gpu-cache.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 10 SORT pagerank DESC LIMIT 30
```