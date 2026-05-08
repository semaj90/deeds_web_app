---
type: "cluster"
cluster_id: "cluster-95"
clusterId: 95
topic: "type chunks in `src/lib/server/db/schema` (tag: database)"
aliases: ["cluster-95","type chunks in `src/lib/server/db/schema` (tag: database)"]
memberCount: 183
pagerank_sum: 0.431474
pagerank_max: 0.431474
risk: "high"
top_tags: ["database","schema","drizzle","auth","embedding"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema__state-constitution-sources]]","[[Files/src__lib__server__db__schema__ace-web-crawl]]","[[Files/src__lib__server__db__schema__legal-chunks]]","[[Files/src__lib__server__db__schema-postgres]]","[[Files/src__lib__server__db__schema__search-analytics]]","[[Files/src__lib__server__db__schema__route_health]]","[[Files/src__lib__server__embedding__embed-schema]]","[[Files/src__lib__db__schema__evidence]]"]
same: ["[[Clusters/cluster-10]]","[[Clusters/cluster-13]]","[[Clusters/cluster-88]]","[[Clusters/cluster-91]]","[[Clusters/cluster-98]]"]
tags: ["cluster","cluster/95"]
---

# type chunks in `src/lib/server/db/schema` (tag: database)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/db/schema, src/lib/server/db, src/lib/db/schema. Top tags: database, schema, drizzle. Risk: high.
cluster:: cluster-95
cluster_id:: 95
member_count:: 8
pagerank_sum:: 0.431474
risk:: high
top_tags:: database, schema, drizzle, auth, embedding
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **high** (pagerank_max=0.431474, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-10]] (jaccard 1.00)
- same:: [[Clusters/cluster-13]] (jaccard 1.00)
- same:: [[Clusters/cluster-88]] (jaccard 1.00)
- same:: [[Clusters/cluster-91]] (jaccard 1.00)
- same:: [[Clusters/cluster-98]] (jaccard 1.00)
## Top Directories
- `src/lib/server/db/schema` (7)
- `src/lib/server/db` (5)
- `src/lib/db/schema` (2)
## Top Tags
- database (15)
- schema (15)
- drizzle (15)
- auth (9)
- embedding (9)
## Members (8)
- contains:: [[Files/src__lib__server__db__schema__state-constitution-sources|src/lib/server/db/schema/state-constitution-sources.ts]]
- contains:: [[Files/src__lib__server__db__schema__ace-web-crawl|src/lib/server/db/schema/ace-web-crawl.ts]]
- contains:: [[Files/src__lib__server__db__schema__legal-chunks|src/lib/server/db/schema/legal-chunks.ts]]
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
- contains:: [[Files/src__lib__server__db__schema__search-analytics|src/lib/server/db/schema/search-analytics.ts]]
- contains:: [[Files/src__lib__server__db__schema__route_health|src/lib/server/db/schema/route_health.ts]]
- contains:: [[Files/src__lib__server__embedding__embed-schema|src/lib/server/embedding/embed-schema.ts]]
- contains:: [[Files/src__lib__db__schema__evidence|src/lib/db/schema/evidence.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 95 SORT pagerank DESC LIMIT 30
```