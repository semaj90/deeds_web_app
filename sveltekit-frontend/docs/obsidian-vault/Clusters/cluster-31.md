---
type: "cluster"
cluster_id: "cluster-31"
clusterId: 31
topic: "route-handler chunks in `src/routes/api/investigate/suggest` (tag: api)"
aliases: ["cluster-31","route-handler chunks in `src/routes/api/investigate/suggest` (tag: api)"]
memberCount: 31
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["api","server","vector","embedding"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__routes__api__investigate__suggest___server]]"]
same: ["[[Clusters/cluster-26]]","[[Clusters/cluster-80]]","[[Clusters/cluster-25]]","[[Clusters/cluster-44]]","[[Clusters/cluster-69]]"]
tags: ["cluster","cluster/31","topic/topic_investigate","topic/topic_suggest","topic/routes"]
---

# route-handler chunks in `src/routes/api/investigate/suggest` (tag: api)
## For future Claude
> This module provides a utility function to perform a database health check by verifying the existence of a predefined set of essential application tables against the database schema.

**Purpose:** Database schema validation and health check
cluster:: cluster-31
cluster_id:: 31
member_count:: 1
pagerank_sum:: 0
risk:: low
top_tags:: api, server, vector, embedding
## Agent hints
Use this cluster when investigating api, server, vector.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-26]] (jaccard 1.00)
- same:: [[Clusters/cluster-80]] (jaccard 1.00)
- same:: [[Clusters/cluster-25]] (jaccard 0.80)
- same:: [[Clusters/cluster-44]] (jaccard 0.80)
- same:: [[Clusters/cluster-69]] (jaccard 0.80)
## Top Directories
- `src/routes/api/investigate/suggest` (1)
## Top Tags
- api (1)
- server (1)
- vector (1)
- embedding (1)
## Members (1)
- contains:: [[Files/src__routes__api__investigate__suggest___server|src/routes/api/investigate/suggest/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 31 SORT pagerank DESC LIMIT 30
```