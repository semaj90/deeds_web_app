---
type: "cluster"
cluster_id: "cluster-6"
clusterId: 6
topic: "function chunks in `src/lib/server/db` (tag: embedding)"
aliases: ["cluster-6","function chunks in `src/lib/server/db` (tag: embedding)"]
memberCount: 700
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["embedding","database","vector","auth","vector-search"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__pgvector-utils.temp]]","[[Files/src__lib__server__db__vector-operations]]","[[Files/src__lib__server__ace__tag-sync]]","[[Files/src__lib__server__db__postgres-knowledge]]","[[Files/src__lib__server__db__qdrant-sync]]","[[Files/src__lib__server__qdrant-integration]]","[[Files/src__lib__server__db__pgvector-utils]]","[[Files/src__lib__server__graph__user-interaction-sync]]"]
same: ["[[Clusters/cluster-48]]","[[Clusters/cluster-15]]","[[Clusters/cluster-59]]","[[Clusters/cluster-10]]","[[Clusters/cluster-13]]"]
tags: ["cluster","cluster/6","topic/auth"]
---

# function chunks in `src/lib/server/db` (tag: embedding)
## For future Claude
> This cluster provides comprehensive services for advanced information retrieval, including vector search, document extraction, and hybrid ranking, while also managing audio processing and auditing tools.

**Purpose:** Knowledge Retrieval and AI Processing Pipeline
cluster:: cluster-6
cluster_id:: 6
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: embedding, database, vector, auth, vector-search
## Agent hints
Use this cluster when investigating embedding, database, vector.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-48]] (jaccard 0.80)
- same:: [[Clusters/cluster-15]] (jaccard 0.60)
- same:: [[Clusters/cluster-59]] (jaccard 0.60)
- same:: [[Clusters/cluster-10]] (jaccard 0.43)
- same:: [[Clusters/cluster-13]] (jaccard 0.43)
## Top Directories
- `src/lib/server/db` (11)
- `src/lib/server/ace` (1)
- `src/lib/server` (1)
## Top Tags
- embedding (15)
- database (11)
- vector (7)
- auth (6)
- vector-search (1)
## Members (8)
- contains:: [[Files/src__lib__server__db__pgvector-utils.temp|src/lib/server/db/pgvector-utils.temp.ts]]
- contains:: [[Files/src__lib__server__db__vector-operations|src/lib/server/db/vector-operations.ts]]
- contains:: [[Files/src__lib__server__ace__tag-sync|src/lib/server/ace/tag-sync.ts]]
- contains:: [[Files/src__lib__server__db__postgres-knowledge|src/lib/server/db/postgres-knowledge.ts]]
- contains:: [[Files/src__lib__server__db__qdrant-sync|src/lib/server/db/qdrant-sync.ts]]
- contains:: [[Files/src__lib__server__qdrant-integration|src/lib/server/qdrant-integration.ts]]
- contains:: [[Files/src__lib__server__db__pgvector-utils|src/lib/server/db/pgvector-utils.ts]]
- contains:: [[Files/src__lib__server__graph__user-interaction-sync|src/lib/server/graph/user-interaction-sync.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 6 SORT pagerank DESC LIMIT 30
```