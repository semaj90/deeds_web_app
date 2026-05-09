---
type: "cluster"
cluster_id: "cluster-13"
clusterId: 13
topic: "table-def chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-13","table-def chunks in `src/lib/server/db` (tag: database)"]
memberCount: 41
pagerank_sum: 0.431474
pagerank_max: 0.431474
risk: "medium"
top_tags: ["database","schema","drizzle","embedding","auth"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema-timeline]]","[[Files/src__lib__server__db__schema-phase89-preserved]]","[[Files/src__lib__server__db__schema-charges]]","[[Files/src__lib__server__db__schema-postgres]]","[[Files/src__lib__db__schema__evidence]]","[[Files/src__routes__api__persons-of-interest___id___timeline___server]]","[[Files/src__routes__api__analytics__context-timeline___server]]"]
same: ["[[Clusters/cluster-10]]","[[Clusters/cluster-88]]","[[Clusters/cluster-91]]","[[Clusters/cluster-95]]","[[Clusters/cluster-98]]"]
tags: ["cluster","cluster/13","topic/routes","topic/auth"]
---

# table-def chunks in `src/lib/server/db` (tag: database)
## For future Claude
> This cluster consists of multiple files that uniformly define a constant to explicitly disable Server-Side Rendering (SSR) for the module.

**Purpose:** Build configuration setting
cluster:: cluster-13
cluster_id:: 13
member_count:: 7
pagerank_sum:: 0.431474
risk:: medium
top_tags:: database, schema, drizzle, embedding, auth
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **medium** (pagerank_max=0.431474, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-10]] (jaccard 1.00)
- same:: [[Clusters/cluster-88]] (jaccard 1.00)
- same:: [[Clusters/cluster-91]] (jaccard 1.00)
- same:: [[Clusters/cluster-95]] (jaccard 1.00)
- same:: [[Clusters/cluster-98]] (jaccard 1.00)
## Top Directories
- `src/lib/server/db` (7)
- `src/lib/db/schema` (1)
- `src/routes/api/persons-of-interest/[id]/timeline` (1)
## Top Tags
- database (8)
- schema (8)
- drizzle (8)
- embedding (5)
- auth (4)
## Members (7)
- contains:: [[Files/src__lib__server__db__schema-timeline|src/lib/server/db/schema-timeline.ts]]
- contains:: [[Files/src__lib__server__db__schema-phase89-preserved|src/lib/server/db/schema-phase89-preserved.ts]]
- contains:: [[Files/src__lib__server__db__schema-charges|src/lib/server/db/schema-charges.ts]]
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
- contains:: [[Files/src__lib__db__schema__evidence|src/lib/db/schema/evidence.ts]]
- contains:: [[Files/src__routes__api__persons-of-interest___id___timeline___server|src/routes/api/persons-of-interest/[id]/timeline/+server.ts]]
- contains:: [[Files/src__routes__api__analytics__context-timeline___server|src/routes/api/analytics/context-timeline/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 13 SORT pagerank DESC LIMIT 30
```