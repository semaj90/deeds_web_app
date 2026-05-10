---
type: "cluster"
cluster_id: "cluster-53"
clusterId: 53
topic: "const chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-53","const chunks in `src/lib/server/db` (tag: database)"]
memberCount: 84
pagerank_sum: 0.638121
pagerank_max: 0.431474
risk: "high"
top_tags: ["database","schema","drizzle","embedding","vector"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__schema__legal-citations]]","[[Files/src__lib__server__db__schema-evidence-crud]]","[[Files/src__lib__server__db__schema-postgres]]","[[Files/src__lib__server__db__schema-ingestion]]","[[Files/src__lib__server__db__schema-chat]]","[[Files/src__lib__server__evidence__type-detector]]","[[Files/src__lib__types__protocol]]","[[Files/src__lib__types__poi]]"]
same: ["[[Clusters/cluster-55]]","[[Clusters/cluster-84]]","[[Clusters/cluster-10]]","[[Clusters/cluster-13]]","[[Clusters/cluster-51]]"]
tags: ["cluster","cluster/53","topic/types","topic/sym_type","topic/sym_chat"]
---

# const chunks in `src/lib/server/db` (tag: database)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/db, src/lib/types, src/lib/server/db/schema. Top tags: database, schema, drizzle. Risk: high.
cluster:: cluster-53
cluster_id:: 53
member_count:: 8
pagerank_sum:: 0.638121
risk:: high
top_tags:: database, schema, drizzle, embedding, vector
## Agent hints
Use this cluster when investigating database, schema, drizzle.
Risk: **high** (pagerank_max=0.431474, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-55]] (jaccard 1.00)
- same:: [[Clusters/cluster-84]] (jaccard 1.00)
- same:: [[Clusters/cluster-10]] (jaccard 0.67)
- same:: [[Clusters/cluster-13]] (jaccard 0.67)
- same:: [[Clusters/cluster-51]] (jaccard 0.67)
## Top Directories
- `src/lib/server/db` (8)
- `src/lib/types` (3)
- `src/lib/server/db/schema` (1)
## Top Tags
- database (9)
- schema (9)
- drizzle (9)
- embedding (9)
- vector (8)
## Members (8)
- contains:: [[Files/src__lib__server__db__schema__legal-citations|src/lib/server/db/schema/legal-citations.ts]]
- contains:: [[Files/src__lib__server__db__schema-evidence-crud|src/lib/server/db/schema-evidence-crud.ts]]
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
- contains:: [[Files/src__lib__server__db__schema-ingestion|src/lib/server/db/schema-ingestion.ts]]
- contains:: [[Files/src__lib__server__db__schema-chat|src/lib/server/db/schema-chat.ts]]
- contains:: [[Files/src__lib__server__evidence__type-detector|src/lib/server/evidence/type-detector.ts]]
- contains:: [[Files/src__lib__types__protocol|src/lib/types/protocol.ts]]
- contains:: [[Files/src__lib__types__poi|src/lib/types/poi.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 53 SORT pagerank DESC LIMIT 30
```