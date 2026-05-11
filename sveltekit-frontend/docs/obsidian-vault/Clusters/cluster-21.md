---
type: "cluster"
cluster_id: "cluster-21"
clusterId: 21
topic: "component chunks in `src/lib/components/legal` (tag: auth)"
aliases: ["cluster-21","component chunks in `src/lib/components/legal` (tag: auth)"]
memberCount: 2980
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["auth","embedding","redis","ai","api"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__components__legal__legalprecedentcard]]","[[Files/src__lib__components__legal__citationmanager]]","[[Files/src__routes___app___simulation___page]]","[[Files/src__lib__server__pdf__legalpacketgenerator]]","[[Files/src__lib__ai__e2b__session]]","[[Files/src__lib__components__dashboard__gamificationwidget]]","[[Files/src__lib__components__evidence__boardsearchoverlay]]","[[Files/src__routes__api__rag__todo-suggestions___server]]"]
same: ["[[Clusters/cluster-72]]","[[Clusters/cluster-14]]","[[Clusters/cluster-46]]","[[Clusters/cluster-5]]","[[Clusters/cluster-19]]"]
tags: ["cluster","cluster/21","topic/legal","topic/topic_legal","topic/components","topic/topic_component","topic/routes"]
---

# component chunks in `src/lib/components/legal` (tag: auth)
## For future Claude
> This cluster provides utilities for GPU-accelerated computation using WebGPU and manages the ingestion and sharding of documents for Retrieval-Augmented Generation (RAG) pipelines.

**Purpose:** Data Processing and Compute Utility Layer
cluster:: cluster-21
cluster_id:: 21
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: auth, embedding, redis, ai, api
## Agent hints
Use this cluster when investigating auth, embedding, redis.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-72]] (jaccard 0.67)
- same:: [[Clusters/cluster-14]] (jaccard 0.60)
- same:: [[Clusters/cluster-46]] (jaccard 0.50)
- same:: [[Clusters/cluster-5]] (jaccard 0.43)
- same:: [[Clusters/cluster-19]] (jaccard 0.43)
## Top Directories
- `src/lib/components/legal` (2)
- `src/lib/server` (2)
- `src/routes/(app)/simulation` (1)
## Top Tags
- auth (5)
- embedding (4)
- redis (3)
- ai (2)
- api (2)
## Members (8)
- contains:: [[Files/src__lib__components__legal__legalprecedentcard|src/lib/components/legal/LegalPrecedentCard.svelte]]
- contains:: [[Files/src__lib__components__legal__citationmanager|src/lib/components/legal/CitationManager.svelte]]
- contains:: [[Files/src__routes___app___simulation___page|src/routes/(app)/simulation/+page.svelte]]
- contains:: [[Files/src__lib__server__pdf__legalpacketgenerator|src/lib/server/pdf/legalPacketGenerator.ts]]
- contains:: [[Files/src__lib__ai__e2b__session|src/lib/ai/e2b/session.ts]]
- contains:: [[Files/src__lib__components__dashboard__gamificationwidget|src/lib/components/dashboard/GamificationWidget.svelte]]
- contains:: [[Files/src__lib__components__evidence__boardsearchoverlay|src/lib/components/evidence/BoardSearchOverlay.svelte]]
- contains:: [[Files/src__routes__api__rag__todo-suggestions___server|src/routes/api/rag/todo-suggestions/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 21 SORT pagerank DESC LIMIT 30
```