---
type: "cluster"
cluster_id: "cluster-17"
clusterId: 17
topic: "function chunks in `src/lib/services/error-analysis` (tag: embedding)"
aliases: ["cluster-17","function chunks in `src/lib/services/error-analysis` (tag: embedding)"]
memberCount: 38
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["embedding","server-module","cache","vector","redis"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__workers__compute-pool]]","[[Files/src__lib__gpu__gpu-compute-pipeline]]","[[Files/src__lib__services__error-analysis__cacheservice]]","[[Files/src__lib__services__error-analysis__decisionengine]]","[[Files/src__lib__services__knowledge-search__postgresknowledgestore]]","[[Files/src__lib__services__error-analysis__fixsynthesizer]]","[[Files/src__lib__services__knowledge-search__minioknowledgestore]]","[[Files/src__lib__services__error-analysis__learningpipeline]]"]
same: ["[[Clusters/cluster-49]]","[[Clusters/cluster-22]]","[[Clusters/cluster-78]]","[[Clusters/cluster-86]]","[[Clusters/cluster-0]]"]
tags: ["cluster","cluster/17","topic/services","topic/error","topic/analysis","topic/knowledge","topic/search"]
---

# function chunks in `src/lib/services/error-analysis` (tag: embedding)
## For future Claude
> This cluster provides foundational, shared infrastructure services for the application, managing state, handling resource pooling (compute and GPU), and providing utilities for configuration, concurrency, and AI processing.

**Purpose:** Core Infrastructure Services / Utility Layer
cluster:: cluster-17
cluster_id:: 17
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: embedding, server-module, cache, vector, redis
## Agent hints
Use this cluster when investigating embedding, server-module, cache.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-49]] (jaccard 0.80)
- same:: [[Clusters/cluster-22]] (jaccard 0.67)
- same:: [[Clusters/cluster-78]] (jaccard 0.67)
- same:: [[Clusters/cluster-86]] (jaccard 0.67)
- same:: [[Clusters/cluster-0]] (jaccard 0.60)
## Top Directories
- `src/lib/services/error-analysis` (6)
- `src/lib/services/knowledge-search` (4)
- `src/lib/gpu` (2)
## Top Tags
- embedding (7)
- server-module (4)
- cache (3)
- vector (3)
- redis (3)
## Members (8)
- contains:: [[Files/src__lib__server__workers__compute-pool|src/lib/server/workers/compute-pool.ts]]
- contains:: [[Files/src__lib__gpu__gpu-compute-pipeline|src/lib/gpu/gpu-compute-pipeline.ts]]
- contains:: [[Files/src__lib__services__error-analysis__cacheservice|src/lib/services/error-analysis/CacheService.ts]]
- contains:: [[Files/src__lib__services__error-analysis__decisionengine|src/lib/services/error-analysis/DecisionEngine.ts]]
- contains:: [[Files/src__lib__services__knowledge-search__postgresknowledgestore|src/lib/services/knowledge-search/PostgresKnowledgeStore.ts]]
- contains:: [[Files/src__lib__services__error-analysis__fixsynthesizer|src/lib/services/error-analysis/FixSynthesizer.ts]]
- contains:: [[Files/src__lib__services__knowledge-search__minioknowledgestore|src/lib/services/knowledge-search/MinioKnowledgeStore.ts]]
- contains:: [[Files/src__lib__services__error-analysis__learningpipeline|src/lib/services/error-analysis/LearningPipeline.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 17 SORT pagerank DESC LIMIT 30
```