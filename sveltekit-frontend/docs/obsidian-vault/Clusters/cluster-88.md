---
type: "cluster"
cluster_id: "cluster-88"
clusterId: 88
topic: "const chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-88","const chunks in `src/lib/server/db` (tag: database)"]
memberCount: 123
pagerank_sum: 0.64333
pagerank_max: 0.431474
risk: "high"
top_tags: ["database","schema","drizzle","auth","embedding"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__relations]]","[[Files/src__lib__server__db__schema-postgres]]","[[Files/src__lib__server__db__schema__legal-relations]]","[[Files/src__lib__db__schema__route-health-tables]]","[[Files/src__lib__server__db__vector-schema]]","[[Files/src__lib__db__schema]]","[[Files/src__lib__server__db__warden-schema]]","[[Files/src__lib__db__schema__evidence]]"]
same: ["[[Clusters/cluster-10]]","[[Clusters/cluster-13]]","[[Clusters/cluster-91]]","[[Clusters/cluster-95]]","[[Clusters/cluster-98]]"]
tags: ["cluster","cluster/88","topic/auth","topic/sym_chat"]
---

# const chunks in `src/lib/server/db` (tag: database)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/db, src/lib/server/db/schema, src/lib/db/schema. Top tags: database, schema, drizzle. Risk: high.
cluster:: cluster-88
cluster_id:: 88
member_count:: 8
pagerank_sum:: 0.64333
risk:: high
top_tags:: database, schema, drizzle, auth, embedding
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **high** (pagerank_max=0.431474, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-10]] (jaccard 1.00)
- same:: [[Clusters/cluster-13]] (jaccard 1.00)
- same:: [[Clusters/cluster-91]] (jaccard 1.00)
- same:: [[Clusters/cluster-95]] (jaccard 1.00)
- same:: [[Clusters/cluster-98]] (jaccard 1.00)
## Top Directories
- `src/lib/server/db` (11)
- `src/lib/server/db/schema` (2)
- `src/lib/db/schema` (2)
## Top Tags
- database (16)
- schema (12)
- drizzle (12)
- auth (11)
- embedding (10)
## Members (8)
- contains:: [[Files/src__lib__server__db__relations|src/lib/server/db/relations.ts]]
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
- contains:: [[Files/src__lib__server__db__schema__legal-relations|src/lib/server/db/schema/legal-relations.ts]]
- contains:: [[Files/src__lib__db__schema__route-health-tables|src/lib/db/schema/route-health-tables.ts]]
- contains:: [[Files/src__lib__server__db__vector-schema|src/lib/server/db/vector-schema.ts]]
- contains:: [[Files/src__lib__db__schema|src/lib/db/schema.ts]]
- contains:: [[Files/src__lib__server__db__warden-schema|src/lib/server/db/warden-schema.ts]]
- contains:: [[Files/src__lib__db__schema__evidence|src/lib/db/schema/evidence.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 88 SORT pagerank DESC LIMIT 30
```