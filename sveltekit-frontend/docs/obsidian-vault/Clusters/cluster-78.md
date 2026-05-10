---
type: "cluster"
cluster_id: "cluster-78"
clusterId: 78
topic: "type chunks in `src/lib/types` (tag: vector)"
aliases: ["cluster-78","type chunks in `src/lib/types` (tag: vector)"]
memberCount: 71
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["vector","embedding","redis","types","server-module"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__schemas__board]]","[[Files/src__lib__types__protocol]]","[[Files/src__lib__server__ai__lang-extract]]","[[Files/src__lib__env.server]]","[[Files/src__lib__server__tools__registry]]","[[Files/src__lib__db__schema]]","[[Files/src__lib__server__db__jsonb-legal-schema]]","[[Files/src__lib__schemas__evidence-upload]]"]
same: ["[[Clusters/cluster-56]]","[[Clusters/cluster-17]]","[[Clusters/cluster-29]]","[[Clusters/cluster-43]]","[[Clusters/cluster-66]]"]
tags: ["cluster","cluster/78"]
---

# type chunks in `src/lib/types` (tag: vector)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/types, src/lib/schemas, src/lib/server/tools. Top tags: vector, embedding, redis. Risk: medium.
cluster:: cluster-78
cluster_id:: 78
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: vector, embedding, redis, types, server-module
## Agent hints
Use this cluster when investigating vector, embedding, redis.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-56]] (jaccard 0.80)
- same:: [[Clusters/cluster-17]] (jaccard 0.67)
- same:: [[Clusters/cluster-29]] (jaccard 0.67)
- same:: [[Clusters/cluster-43]] (jaccard 0.67)
- same:: [[Clusters/cluster-66]] (jaccard 0.67)
## Top Directories
- `src/lib/types` (5)
- `src/lib/schemas` (3)
- `src/lib/server/tools` (3)
## Top Tags
- vector (10)
- embedding (10)
- redis (7)
- types (5)
- server-module (4)
## Members (8)
- contains:: [[Files/src__lib__schemas__board|src/lib/schemas/board.ts]]
- contains:: [[Files/src__lib__types__protocol|src/lib/types/protocol.ts]]
- contains:: [[Files/src__lib__server__ai__lang-extract|src/lib/server/ai/lang-extract.ts]]
- contains:: [[Files/src__lib__env.server|src/lib/env.server.ts]]
- contains:: [[Files/src__lib__server__tools__registry|src/lib/server/tools/registry.ts]]
- contains:: [[Files/src__lib__db__schema|src/lib/db/schema.ts]]
- contains:: [[Files/src__lib__server__db__jsonb-legal-schema|src/lib/server/db/jsonb-legal-schema.ts]]
- contains:: [[Files/src__lib__schemas__evidence-upload|src/lib/schemas/evidence-upload.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 78 SORT pagerank DESC LIMIT 30
```