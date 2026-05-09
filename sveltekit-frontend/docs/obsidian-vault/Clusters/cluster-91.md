---
type: "cluster"
cluster_id: "cluster-91"
clusterId: 91
topic: "type chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-91","type chunks in `src/lib/server/db` (tag: database)"]
memberCount: 162
pagerank_sum: 0.431474
pagerank_max: 0.431474
risk: "high"
top_tags: ["database","schema","drizzle","embedding","auth"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema__error_events]]","[[Files/src__lib__server__db__schema-postgres]]","[[Files/src__lib__db__schema__route-health-tables]]","[[Files/src__lib__server__db__schema__route_health]]","[[Files/src__lib__db__vite-error-schema]]","[[Files/src__lib__server__db__schema__search-analytics]]","[[Files/src__lib__db__schema]]","[[Files/src__lib__server__db__jsonb-legal-schema]]"]
same: ["[[Clusters/cluster-10]]","[[Clusters/cluster-13]]","[[Clusters/cluster-88]]","[[Clusters/cluster-95]]","[[Clusters/cluster-98]]"]
tags: ["cluster","cluster/91","topic/auth","topic/sym_evidence"]
---

# type chunks in `src/lib/server/db` (tag: database)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/db, src/lib/server/db/schema, src/lib/db. Top tags: database, schema, drizzle. Risk: high.
cluster:: cluster-91
cluster_id:: 91
member_count:: 8
pagerank_sum:: 0.431474
risk:: high
top_tags:: database, schema, drizzle, embedding, auth
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **high** (pagerank_max=0.431474, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-10]] (jaccard 1.00)
- same:: [[Clusters/cluster-13]] (jaccard 1.00)
- same:: [[Clusters/cluster-88]] (jaccard 1.00)
- same:: [[Clusters/cluster-95]] (jaccard 1.00)
- same:: [[Clusters/cluster-98]] (jaccard 1.00)
## Top Directories
- `src/lib/server/db` (10)
- `src/lib/server/db/schema` (3)
- `src/lib/db` (2)
## Top Tags
- database (16)
- schema (16)
- drizzle (16)
- embedding (14)
- auth (11)
## Members (8)
- contains:: [[Files/src__lib__server__db__schema__error_events|src/lib/server/db/schema/error_events.ts]]
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
- contains:: [[Files/src__lib__db__schema__route-health-tables|src/lib/db/schema/route-health-tables.ts]]
- contains:: [[Files/src__lib__server__db__schema__route_health|src/lib/server/db/schema/route_health.ts]]
- contains:: [[Files/src__lib__db__vite-error-schema|src/lib/db/vite-error-schema.ts]]
- contains:: [[Files/src__lib__server__db__schema__search-analytics|src/lib/server/db/schema/search-analytics.ts]]
- contains:: [[Files/src__lib__db__schema|src/lib/db/schema.ts]]
- contains:: [[Files/src__lib__server__db__jsonb-legal-schema|src/lib/server/db/jsonb-legal-schema.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 91 SORT pagerank DESC LIMIT 30
```