---
type: "cluster"
cluster_id: "cluster-25"
clusterId: 25
topic: "route-handler chunks in `src/lib/server` (tag: redis)"
aliases: ["cluster-25","route-handler chunks in `src/lib/server` (tag: redis)"]
memberCount: 974
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["redis","api","server","embedding","vector"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__knowledge-cache]]","[[Files/src__routes__api__cache__metrics___server]]","[[Files/src__routes__api__health__status___server]]","[[Files/src__routes__api__ml__cluster-status___server]]","[[Files/src__routes__api__glyph__tile-atlas___server]]","[[Files/src__routes__api__cache__stats___server]]","[[Files/src__lib__server__cache__cartridge-tensor-bridge]]","[[Files/src__routes__api__chrrom__push___server]]"]
same: ["[[Clusters/cluster-70]]","[[Clusters/cluster-85]]","[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-80]]"]
tags: ["cluster","cluster/25","topic/routes","topic/sym_get"]
---

# route-handler chunks in `src/lib/server` (tag: redis)
## For future Claude
> This file appears to be a Svelte page component responsible for displaying and managing simulated Nintendo Entertainment System (NES) memory and cartridge data.

**Purpose:** UI Component / State Management
cluster:: cluster-25
cluster_id:: 25
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: redis, api, server, embedding, vector
## Agent hints
Use this cluster when investigating redis, api, server.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-70]] (jaccard 1.00)
- same:: [[Clusters/cluster-85]] (jaccard 1.00)
- same:: [[Clusters/cluster-26]] (jaccard 0.80)
- same:: [[Clusters/cluster-31]] (jaccard 0.80)
- same:: [[Clusters/cluster-80]] (jaccard 0.80)
## Top Directories
- `src/lib/server` (1)
- `src/routes/api/cache/metrics` (1)
- `src/routes/api/health/status` (1)
## Top Tags
- redis (11)
- api (11)
- server (11)
- embedding (9)
- vector (5)
## Members (8)
- contains:: [[Files/src__lib__server__knowledge-cache|src/lib/server/knowledge-cache.ts]]
- contains:: [[Files/src__routes__api__cache__metrics___server|src/routes/api/cache/metrics/+server.ts]]
- contains:: [[Files/src__routes__api__health__status___server|src/routes/api/health/status/+server.ts]]
- contains:: [[Files/src__routes__api__ml__cluster-status___server|src/routes/api/ml/cluster-status/+server.ts]]
- contains:: [[Files/src__routes__api__glyph__tile-atlas___server|src/routes/api/glyph/tile-atlas/+server.ts]]
- contains:: [[Files/src__routes__api__cache__stats___server|src/routes/api/cache/stats/+server.ts]]
- contains:: [[Files/src__lib__server__cache__cartridge-tensor-bridge|src/lib/server/cache/cartridge-tensor-bridge.ts]]
- contains:: [[Files/src__routes__api__chrrom__push___server|src/routes/api/chrrom/push/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 25 SORT pagerank DESC LIMIT 30
```