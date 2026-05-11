---
type: "cluster"
cluster_id: "cluster-24"
clusterId: 24
topic: "class chunks in `src/lib/server/workers` (tag: redis)"
aliases: ["cluster-24","class chunks in `src/lib/server/workers` (tag: redis)"]
memberCount: 297
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["redis","vector","embedding","rabbitmq","worker"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__workers__audio-processor]]","[[Files/src__lib__server__workers__video-vlm-processor]]","[[Files/src__lib__server__workers__audio-queue-consumer]]"]
same: ["[[Clusters/cluster-19]]","[[Clusters/cluster-22]]","[[Clusters/cluster-75]]","[[Clusters/cluster-77]]","[[Clusters/cluster-96]]"]
tags: ["cluster","cluster/24","topic/workers","topic/topic_workers","topic/topic_class"]
---

# class chunks in `src/lib/server/workers` (tag: redis)
## For future Claude
> Cluster of 3 files. Top dirs: src/lib/server/workers. Top tags: redis, vector, embedding. Risk: medium.
cluster:: cluster-24
cluster_id:: 24
member_count:: 3
pagerank_sum:: 0
risk:: medium
top_tags:: redis, vector, embedding, rabbitmq, worker
## Agent hints
Use this cluster when investigating redis, vector, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-19]] (jaccard 0.67)
- same:: [[Clusters/cluster-22]] (jaccard 0.67)
- same:: [[Clusters/cluster-75]] (jaccard 0.67)
- same:: [[Clusters/cluster-77]] (jaccard 0.67)
- same:: [[Clusters/cluster-96]] (jaccard 0.67)
## Top Directories
- `src/lib/server/workers` (3)
## Top Tags
- redis (3)
- vector (1)
- embedding (1)
- rabbitmq (1)
- worker (1)
## Members (3)
- contains:: [[Files/src__lib__server__workers__audio-processor|src/lib/server/workers/audio-processor.ts]]
- contains:: [[Files/src__lib__server__workers__video-vlm-processor|src/lib/server/workers/video-vlm-processor.ts]]
- contains:: [[Files/src__lib__server__workers__audio-queue-consumer|src/lib/server/workers/audio-queue-consumer.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 24 SORT pagerank DESC LIMIT 30
```