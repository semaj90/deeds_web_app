---
type: "cluster"
cluster_id: "cluster-84"
clusterId: 84
topic: "function chunks in `src/lib/server/audit` (tag: vector)"
aliases: ["cluster-84","function chunks in `src/lib/server/audit` (tag: vector)"]
memberCount: 69
pagerank_sum: 0.431474
pagerank_max: 0.431474
risk: "high"
top_tags: ["vector","embedding","database","schema","drizzle"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__audit__gemma-tool-router]]","[[Files/src__lib__server__audit__gpu-audit-orchestrator]]","[[Files/src__lib__server__db__schema-postgres]]","[[Files/src__routes__api__audit__gpu___server]]"]
same: ["[[Clusters/cluster-53]]","[[Clusters/cluster-55]]","[[Clusters/cluster-10]]","[[Clusters/cluster-13]]","[[Clusters/cluster-51]]"]
tags: ["cluster","cluster/84","topic/topic_vector","topic/routes","topic/sym_get"]
---

# function chunks in `src/lib/server/audit` (tag: vector)
## For future Claude
> Cluster of 4 files. Top dirs: src/lib/server/audit, src/lib/server/db, src/routes/api/audit/gpu. Top tags: vector, embedding, database. Risk: high.
cluster:: cluster-84
cluster_id:: 84
member_count:: 4
pagerank_sum:: 0.431474
risk:: high
top_tags:: vector, embedding, database, schema, drizzle
## Agent hints
Use this cluster when investigating vector, embedding, database.
Risk: **high** (pagerank_max=0.431474, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-53]] (jaccard 1.00)
- same:: [[Clusters/cluster-55]] (jaccard 1.00)
- same:: [[Clusters/cluster-10]] (jaccard 0.67)
- same:: [[Clusters/cluster-13]] (jaccard 0.67)
- same:: [[Clusters/cluster-51]] (jaccard 0.67)
## Top Directories
- `src/lib/server/audit` (6)
- `src/lib/server/db` (1)
- `src/routes/api/audit/gpu` (1)
## Top Tags
- vector (8)
- embedding (7)
- database (1)
- schema (1)
- drizzle (1)
## Members (4)
- contains:: [[Files/src__lib__server__audit__gemma-tool-router|src/lib/server/audit/gemma-tool-router.ts]]
- contains:: [[Files/src__lib__server__audit__gpu-audit-orchestrator|src/lib/server/audit/gpu-audit-orchestrator.ts]]
- contains:: [[Files/src__lib__server__db__schema-postgres|src/lib/server/db/schema-postgres.ts]]
- contains:: [[Files/src__routes__api__audit__gpu___server|src/routes/api/audit/gpu/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 84 SORT pagerank DESC LIMIT 30
```