---
type: "cluster"
cluster_id: "cluster-75"
clusterId: 75
topic: "function chunks in `src/lib/config` (tag: embedding)"
aliases: ["cluster-75","function chunks in `src/lib/config` (tag: embedding)"]
memberCount: 416
pagerank_sum: 0.299072
pagerank_max: 0.299072
risk: "high"
top_tags: ["embedding","vector","redis","rabbitmq","ai"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__config__ollama]]","[[Files/src__lib__config__env.server]]","[[Files/src__lib__server__ai__ollama-config]]","[[Files/src__lib__server__config]]","[[Files/src__lib__config__database]]","[[Files/src__lib__config__redis-config]]","[[Files/src__lib__server__minio]]","[[Files/src__lib__services__knowledge-search__qdrantknowledgestore]]"]
same: ["[[Clusters/cluster-19]]","[[Clusters/cluster-46]]","[[Clusters/cluster-22]]","[[Clusters/cluster-24]]","[[Clusters/cluster-72]]"]
tags: ["cluster","cluster/75","topic/sym_get","topic/sym_ollama"]
---

# function chunks in `src/lib/config` (tag: embedding)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/config, src/lib/server, src/lib/server/config. Top tags: embedding, vector, redis. Risk: high.
cluster:: cluster-75
cluster_id:: 75
member_count:: 8
pagerank_sum:: 0.299072
risk:: high
top_tags:: embedding, vector, redis, rabbitmq, ai
## Agent hints
Use this cluster when investigating embedding, vector, redis.
Risk: **high** (pagerank_max=0.299072, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-19]] (jaccard 1.00)
- same:: [[Clusters/cluster-46]] (jaccard 0.80)
- same:: [[Clusters/cluster-22]] (jaccard 0.67)
- same:: [[Clusters/cluster-24]] (jaccard 0.67)
- same:: [[Clusters/cluster-72]] (jaccard 0.67)
## Top Directories
- `src/lib/config` (6)
- `src/lib/server` (2)
- `src/lib/server/config` (1)
## Top Tags
- embedding (9)
- vector (9)
- redis (7)
- rabbitmq (5)
- ai (2)
## Members (8)
- contains:: [[Files/src__lib__server__config__ollama|src/lib/server/config/ollama.ts]]
- contains:: [[Files/src__lib__config__env.server|src/lib/config/env.server.ts]]
- contains:: [[Files/src__lib__server__ai__ollama-config|src/lib/server/ai/ollama-config.ts]]
- contains:: [[Files/src__lib__server__config|src/lib/server/config.ts]]
- contains:: [[Files/src__lib__config__database|src/lib/config/database.ts]]
- contains:: [[Files/src__lib__config__redis-config|src/lib/config/redis-config.ts]]
- contains:: [[Files/src__lib__server__minio|src/lib/server/minio.ts]]
- contains:: [[Files/src__lib__services__knowledge-search__qdrantknowledgestore|src/lib/services/knowledge-search/QdrantKnowledgeStore.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 75 SORT pagerank DESC LIMIT 30
```