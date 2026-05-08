---
type: "cluster"
cluster_id: "cluster-22"
clusterId: 22
topic: "function chunks in `src/lib/server/cache` (tag: redis)"
aliases: ["cluster-22","function chunks in `src/lib/server/cache` (tag: redis)"]
memberCount: 86
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["redis","vector","embedding","cache","rabbitmq"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__cache__cartridge-tensor-bridge]]","[[Files/src__lib__server__cartridge__glyph-tile-engine]]","[[Files/src__lib__server__glyph-prompt-cache]]","[[Files/src__lib__server__cache-keys]]","[[Files/src__lib__components__evidence__board-persistence.svelte]]","[[Files/src__lib__server__cache__report-template-cache]]"]
same: ["[[Clusters/cluster-49]]","[[Clusters/cluster-17]]","[[Clusters/cluster-19]]","[[Clusters/cluster-24]]","[[Clusters/cluster-75]]"]
tags: ["cluster","cluster/22"]
---

# function chunks in `src/lib/server/cache` (tag: redis)
## For future Claude
> Cluster of 6 files. Top dirs: src/lib/server/cache, src/lib/server/cartridge, src/lib/server. Top tags: redis, vector, embedding. Risk: medium.
cluster:: cluster-22
cluster_id:: 22
member_count:: 6
pagerank_sum:: 0
risk:: medium
top_tags:: redis, vector, embedding, cache, rabbitmq
## Agent hints
Use this cluster when investigating redis, vector, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-49]] (jaccard 0.80)
- same:: [[Clusters/cluster-17]] (jaccard 0.67)
- same:: [[Clusters/cluster-19]] (jaccard 0.67)
- same:: [[Clusters/cluster-24]] (jaccard 0.67)
- same:: [[Clusters/cluster-75]] (jaccard 0.67)
## Top Directories
- `src/lib/server/cache` (7)
- `src/lib/server/cartridge` (2)
- `src/lib/server` (2)
## Top Tags
- redis (11)
- vector (10)
- embedding (9)
- cache (7)
- rabbitmq (2)
## Members (6)
- contains:: [[Files/src__lib__server__cache__cartridge-tensor-bridge|src/lib/server/cache/cartridge-tensor-bridge.ts]]
- contains:: [[Files/src__lib__server__cartridge__glyph-tile-engine|src/lib/server/cartridge/glyph-tile-engine.ts]]
- contains:: [[Files/src__lib__server__glyph-prompt-cache|src/lib/server/glyph-prompt-cache.ts]]
- contains:: [[Files/src__lib__server__cache-keys|src/lib/server/cache-keys.ts]]
- contains:: [[Files/src__lib__components__evidence__board-persistence.svelte|src/lib/components/evidence/board-persistence.svelte.ts]]
- contains:: [[Files/src__lib__server__cache__report-template-cache|src/lib/server/cache/report-template-cache.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 22 SORT pagerank DESC LIMIT 30
```