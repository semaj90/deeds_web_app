---
type: "cluster"
cluster_id: "cluster-96"
clusterId: 96
topic: "type chunks in `src/lib/server` (tag: embedding)"
aliases: ["cluster-96","type chunks in `src/lib/server` (tag: embedding)"]
memberCount: 177
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["embedding","redis","vector","types","rabbitmq"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__cache-keys]]","[[Files/src__lib__types__evidence]]","[[Files/src__lib__server__rabbitmq]]","[[Files/src__lib__server__queue__workflow-publish]]","[[Files/src__lib__machines__evidence-lifecycle-machine]]","[[Files/src__lib__machines__evidence-analysis-machine]]","[[Files/src__lib__server__evidence-progress]]","[[Files/src__lib__server__evidence__type-detector]]"]
same: ["[[Clusters/cluster-56]]","[[Clusters/cluster-19]]","[[Clusters/cluster-22]]","[[Clusters/cluster-24]]","[[Clusters/cluster-29]]"]
tags: ["cluster","cluster/96","topic/types","topic/sym_evidence","topic/sym_type","topic/sym_web"]
---

# type chunks in `src/lib/server` (tag: embedding)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server, src/lib/types, src/lib/machines. Top tags: embedding, redis, vector. Risk: medium.
cluster:: cluster-96
cluster_id:: 96
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: embedding, redis, vector, types, rabbitmq
## Agent hints
Use this cluster when investigating embedding, redis, vector.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-56]] (jaccard 0.80)
- same:: [[Clusters/cluster-19]] (jaccard 0.67)
- same:: [[Clusters/cluster-22]] (jaccard 0.67)
- same:: [[Clusters/cluster-24]] (jaccard 0.67)
- same:: [[Clusters/cluster-29]] (jaccard 0.67)
## Top Directories
- `src/lib/server` (3)
- `src/lib/types` (2)
- `src/lib/machines` (2)
## Top Tags
- embedding (6)
- redis (5)
- vector (4)
- types (3)
- rabbitmq (2)
## Members (8)
- contains:: [[Files/src__lib__server__cache-keys|src/lib/server/cache-keys.ts]]
- contains:: [[Files/src__lib__types__evidence|src/lib/types/evidence.ts]]
- contains:: [[Files/src__lib__server__rabbitmq|src/lib/server/rabbitmq.ts]]
- contains:: [[Files/src__lib__server__queue__workflow-publish|src/lib/server/queue/workflow-publish.ts]]
- contains:: [[Files/src__lib__machines__evidence-lifecycle-machine|src/lib/machines/evidence-lifecycle-machine.ts]]
- contains:: [[Files/src__lib__machines__evidence-analysis-machine|src/lib/machines/evidence-analysis-machine.ts]]
- contains:: [[Files/src__lib__server__evidence-progress|src/lib/server/evidence-progress.ts]]
- contains:: [[Files/src__lib__server__evidence__type-detector|src/lib/server/evidence/type-detector.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 96 SORT pagerank DESC LIMIT 30
```