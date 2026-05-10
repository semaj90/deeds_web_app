---
type: "cluster"
cluster_id: "cluster-55"
clusterId: 55
topic: "table-def chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-55","table-def chunks in `src/lib/server/db` (tag: database)"]
memberCount: 577
pagerank_sum: 0.431474
pagerank_max: 0.431474
risk: "medium"
top_tags: ["database","schema","drizzle","embedding","vector"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema-postgres]]","[[Files/src__lib__server__db__schema-phase78]]","[[Files/src__lib__server__db__schema-web]]","[[Files/src__lib__server__db__schema__search-analytics]]","[[Files/src__lib__db__schema__gpuinferencedemo]]","[[Files/src__lib__db__schema__ace-web]]","[[Files/src__lib__db__vite-error-schema]]","[[Files/src__lib__server__db__schema__ingestion-jobs]]"]
same: ["[[Clusters/cluster-53]]","[[Clusters/cluster-84]]","[[Clusters/cluster-10]]","[[Clusters/cluster-13]]","[[Clusters/cluster-51]]"]
tags: ["cluster","cluster/55"]
---

# table-def chunks in `src/lib/server/db` (tag: database)
## For future Claude
> This cluster defines a comprehensive set of TypeScript types that mirror the structure of various underlying database tables. These types are used throughout the application to ensure type safety when interacting with the database, covering domains from web crawling to legal document management.

**Purpose:** Database Schema Type Definition Layer
cluster:: cluster-55
cluster_id:: 55
member_count:: 8
pagerank_sum:: 0.431474
risk:: medium
top_tags:: database, schema, drizzle, embedding, vector
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **medium** (pagerank_max=0.431474, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-53]] (jaccard 1.00)
- same:: [[Clusters/cluster-84]] (jaccard 1.00)
- same:: [[Clusters/cluster-10]] (jaccard 0.67)
- same:: [[Clusters/cluster-13]] (jaccard 0.67)
- same:: [[Clusters/cluster-51]] (jaccard 0.67)
## Top Directories
- `src/lib/server/db` (11)
- `src/lib/server/db/schema` (2)
- `src/lib/db/schema` (2)
## Top Tags
- database (16)
- schema (16)
- drizzle (16)
- embedding (14)
- vector (9)
## Members (8)
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
- contains:: [[Files/src__lib__server__db__schema-phase78|src/lib/server/db/schema-phase78.ts]]
- contains:: [[Files/src__lib__server__db__schema-web|src/lib/server/db/schema-web.ts]]
- contains:: [[Files/src__lib__server__db__schema__search-analytics|src/lib/server/db/schema/search-analytics.ts]]
- contains:: [[Files/src__lib__db__schema__gpuinferencedemo|src/lib/db/schema/gpuInferenceDemo.ts]]
- contains:: [[Files/src__lib__db__schema__ace-web|src/lib/db/schema/ace-web.ts]]
- contains:: [[Files/src__lib__db__vite-error-schema|src/lib/db/vite-error-schema.ts]]
- contains:: [[Files/src__lib__server__db__schema__ingestion-jobs|src/lib/server/db/schema/ingestion-jobs.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 55 SORT pagerank DESC LIMIT 30
```