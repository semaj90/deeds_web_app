---
type: "cluster"
cluster_id: "cluster-15"
clusterId: 15
topic: "function chunks in `src/lib/server/db` (tag: database)"
aliases: ["cluster-15","function chunks in `src/lib/server/db` (tag: database)"]
memberCount: 31
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["database","auth","embedding"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__server__db__connections]]","[[Files/src__lib__server__db__pgvector-utils]]"]
same: ["[[Clusters/cluster-48]]","[[Clusters/cluster-6]]","[[Clusters/cluster-10]]","[[Clusters/cluster-13]]","[[Clusters/cluster-88]]"]
tags: ["cluster","cluster/15","topic/auth"]
---

# function chunks in `src/lib/server/db` (tag: database)
## For future Claude
> This cluster provides backend services for managing complex data workflows, including job queuing, caching (Redis/memory), database extensions, and user authentication.

**Purpose:** Backend Service Layer
cluster:: cluster-15
cluster_id:: 15
member_count:: 2
pagerank_sum:: 0
risk:: low
top_tags:: database, auth, embedding
## Agent hints
Use this cluster when investigating database, auth, embedding.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-48]] (jaccard 0.75)
- same:: [[Clusters/cluster-6]] (jaccard 0.60)
- same:: [[Clusters/cluster-10]] (jaccard 0.60)
- same:: [[Clusters/cluster-13]] (jaccard 0.60)
- same:: [[Clusters/cluster-88]] (jaccard 0.60)
## Top Directories
- `src/lib/server/db` (2)
## Top Tags
- database (2)
- auth (1)
- embedding (1)
## Members (2)
- contains:: [[Files/src__lib__server__db__connections|src/lib/server/db/connections.ts]]
- contains:: [[Files/src__lib__server__db__pgvector-utils|src/lib/server/db/pgvector-utils.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 15 SORT pagerank DESC LIMIT 30
```