---
type: "cluster"
cluster_id: "cluster-44"
clusterId: 44
topic: "route-handler chunks in `src/lib/server/llm` (tag: api)"
aliases: ["cluster-44","route-handler chunks in `src/lib/server/llm` (tag: api)"]
memberCount: 1062
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["api","server","embedding","auth","vector"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__routes__api__ai__memo-skeleton___server]]","[[Files/src__lib__server__llm__ollamaclient]]","[[Files/src__routes__api__ai__cross-exam___server]]","[[Files/src__routes__api__ai__legal-research___server]]","[[Files/src__routes__api__ai__ask___server]]","[[Files/src__lib__server__ace__gemma4-codeintel]]","[[Files/src__routes__api__cases___id___analyze__stream___server]]","[[Files/src__routes__api__phase72__suggest-fix___server]]"]
same: ["[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-80]]","[[Clusters/cluster-25]]","[[Clusters/cluster-69]]"]
tags: ["cluster","cluster/44"]
---

# route-handler chunks in `src/lib/server/llm` (tag: api)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/llm, src/routes/api/ai/memo-skeleton, src/routes/api/ai/cross-exam. Top tags: api, server, embedding. Risk: medium.
cluster:: cluster-44
cluster_id:: 44
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: api, server, embedding, auth, vector
## Agent hints
Use this cluster when investigating api, server, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-26]] (jaccard 0.80)
- same:: [[Clusters/cluster-31]] (jaccard 0.80)
- same:: [[Clusters/cluster-80]] (jaccard 0.80)
- same:: [[Clusters/cluster-25]] (jaccard 0.67)
- same:: [[Clusters/cluster-69]] (jaccard 0.67)
## Top Directories
- `src/lib/server/llm` (2)
- `src/routes/api/ai/memo-skeleton` (1)
- `src/routes/api/ai/cross-exam` (1)
## Top Tags
- api (11)
- server (11)
- embedding (4)
- auth (3)
- vector (2)
## Members (8)
- contains:: [[Files/src__routes__api__ai__memo-skeleton___server|src/routes/api/ai/memo-skeleton/+server.ts]]
- contains:: [[Files/src__lib__server__llm__ollamaclient|src/lib/server/llm/ollamaClient.ts]]
- contains:: [[Files/src__routes__api__ai__cross-exam___server|src/routes/api/ai/cross-exam/+server.ts]]
- contains:: [[Files/src__routes__api__ai__legal-research___server|src/routes/api/ai/legal-research/+server.ts]]
- contains:: [[Files/src__routes__api__ai__ask___server|src/routes/api/ai/ask/+server.ts]]
- contains:: [[Files/src__lib__server__ace__gemma4-codeintel|src/lib/server/ace/gemma4-codeintel.ts]]
- contains:: [[Files/src__routes__api__cases___id___analyze__stream___server|src/routes/api/cases/[id]/analyze/stream/+server.ts]]
- contains:: [[Files/src__routes__api__phase72__suggest-fix___server|src/routes/api/phase72/suggest-fix/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 44 SORT pagerank DESC LIMIT 30
```