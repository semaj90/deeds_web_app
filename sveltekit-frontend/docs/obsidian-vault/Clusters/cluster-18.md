---
type: "cluster"
cluster_id: "cluster-18"
clusterId: 18
topic: "type chunks in `src/lib/types` (tag: embedding)"
aliases: ["cluster-18","type chunks in `src/lib/types` (tag: embedding)"]
memberCount: 190
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["embedding","types","auth","api-route","analytics"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__types__database]]","[[Files/src__lib__types__case-theory]]","[[Files/src__lib__server__vector__pgvector]]","[[Files/src__lib__types__legal-corpus]]","[[Files/src__lib__types__case-summary]]","[[Files/src__lib__components__cases__index]]","[[Files/src__lib__types__poi]]","[[Files/src__lib__types__sharedtypes]]"]
same: ["[[Clusters/cluster-9]]","[[Clusters/cluster-82]]","[[Clusters/cluster-23]]","[[Clusters/cluster-29]]","[[Clusters/cluster-43]]"]
tags: ["cluster","cluster/18","topic/types","topic/sym_case","topic/cases","topic/components","topic/auth"]
---

# type chunks in `src/lib/types` (tag: embedding)
## For future Claude
> This cluster defines a set of TypeScript interfaces and types used throughout the application to structure data related to legal cases, evidence, error analysis, and external service interactions.

**Purpose:** Data modeling and type definition layer
cluster:: cluster-18
cluster_id:: 18
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: embedding, types, auth, api-route, analytics
## Agent hints
Use this cluster when investigating embedding, types, auth.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-9]] (jaccard 0.80)
- same:: [[Clusters/cluster-82]] (jaccard 0.67)
- same:: [[Clusters/cluster-23]] (jaccard 0.43)
- same:: [[Clusters/cluster-29]] (jaccard 0.43)
- same:: [[Clusters/cluster-43]] (jaccard 0.43)
## Top Directories
- `src/lib/types` (8)
- `src/lib/server/vector` (2)
- `src/lib/components/cases` (2)
## Top Tags
- embedding (6)
- types (5)
- auth (3)
- api-route (1)
- analytics (1)
## Members (8)
- contains:: [[Files/src__lib__types__database|src/lib/types/database.ts]]
- contains:: [[Files/src__lib__types__case-theory|src/lib/types/case-theory.ts]]
- contains:: [[Files/src__lib__server__vector__pgvector|src/lib/server/vector/pgvector.ts]]
- contains:: [[Files/src__lib__types__legal-corpus|src/lib/types/legal-corpus.ts]]
- contains:: [[Files/src__lib__types__case-summary|src/lib/types/case-summary.ts]]
- contains:: [[Files/src__lib__components__cases__index|src/lib/components/cases/index.ts]]
- contains:: [[Files/src__lib__types__poi|src/lib/types/poi.ts]]
- contains:: [[Files/src__lib__types__sharedtypes|src/lib/types/sharedTypes.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 18 SORT pagerank DESC LIMIT 30
```