---
type: "cluster"
cluster_id: "cluster-77"
clusterId: 77
topic: "type chunks in `src/lib/types` (tag: embedding)"
aliases: ["cluster-77","type chunks in `src/lib/types` (tag: embedding)"]
memberCount: 134
pagerank_sum: 0.209264
pagerank_max: 0.209264
risk: "high"
top_tags: ["embedding","vector","redis","auth","rabbitmq"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__types__external-services]]","[[Files/src__lib__types__pipeline-v2]]","[[Files/src__lib__server__qdrant-http]]","[[Files/src__lib__server__types__qdrant]]","[[Files/src__lib__types__vector-jobs]]","[[Files/src__lib__types__database]]","[[Files/src__lib__server__vector__qdrant-manager]]","[[Files/src__lib__server__embedding__embed-schema]]"]
same: ["[[Clusters/cluster-19]]","[[Clusters/cluster-20]]","[[Clusters/cluster-22]]","[[Clusters/cluster-24]]","[[Clusters/cluster-29]]"]
tags: ["cluster","cluster/77","topic/types","topic/sym_qdrant","topic/auth"]
---

# type chunks in `src/lib/types` (tag: embedding)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/types, src/lib/server, src/lib/server/types. Top tags: embedding, vector, redis. Risk: high.
cluster:: cluster-77
cluster_id:: 77
member_count:: 8
pagerank_sum:: 0.209264
risk:: high
top_tags:: embedding, vector, redis, auth, rabbitmq
## Agent hints
Use this cluster when investigating embedding, vector, redis.
Risk: **high** (pagerank_max=0.209264, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-19]] (jaccard 0.67)
- same:: [[Clusters/cluster-20]] (jaccard 0.67)
- same:: [[Clusters/cluster-22]] (jaccard 0.67)
- same:: [[Clusters/cluster-24]] (jaccard 0.67)
- same:: [[Clusters/cluster-29]] (jaccard 0.67)
## Top Directories
- `src/lib/types` (10)
- `src/lib/server` (2)
- `src/lib/server/types` (2)
## Top Tags
- embedding (12)
- vector (11)
- redis (9)
- auth (5)
- rabbitmq (4)
## Members (8)
- contains:: [[Files/src__lib__types__external-services|src/lib/types/external-services.ts]]
- contains:: [[Files/src__lib__types__pipeline-v2|src/lib/types/pipeline-v2.ts]]
- contains:: [[Files/src__lib__server__qdrant-http|src/lib/server/qdrant-http.ts]]
- contains:: [[Files/src__lib__server__types__qdrant|src/lib/server/types/qdrant.ts]]
- contains:: [[Files/src__lib__types__vector-jobs|src/lib/types/vector-jobs.ts]]
- contains:: [[Files/src__lib__types__database|src/lib/types/database.ts]]
- contains:: [[Files/src__lib__server__vector__qdrant-manager|src/lib/server/vector/qdrant-manager.ts]]
- contains:: [[Files/src__lib__server__embedding__embed-schema|src/lib/server/embedding/embed-schema.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 77 SORT pagerank DESC LIMIT 30
```