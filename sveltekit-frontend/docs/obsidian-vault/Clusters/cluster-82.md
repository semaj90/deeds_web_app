---
type: "cluster"
cluster_id: "cluster-82"
clusterId: 82
topic: "function chunks in `src/lib/server/grpc` (tag: embedding)"
aliases: ["cluster-82","function chunks in `src/lib/server/grpc` (tag: embedding)"]
memberCount: 903
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["embedding","vector","api-route","auth","analytics"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__server__grpc__tool-calling-client]]","[[Files/src__lib__server__grpc__tool-router-client]]","[[Files/src__lib__server__training__query-logger]]","[[Files/src__lib__server__grpc__retrieval-client]]","[[Files/src__lib__server__mcp__mcp-internal]]","[[Files/src__lib__server__gpu__mapreduce-cuda-analyzer]]","[[Files/src__lib__server__grpc__codeintel-client]]","[[Files/src__lib__server__retrieval__codebase-context]]"]
same: ["[[Clusters/cluster-18]]","[[Clusters/cluster-59]]","[[Clusters/cluster-9]]","[[Clusters/cluster-48]]","[[Clusters/cluster-6]]"]
tags: ["cluster","cluster/82","topic/sym_response","topic/analytics","topic/auth"]
---

# function chunks in `src/lib/server/grpc` (tag: embedding)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/grpc, src/lib/server/training, src/lib/server/mcp. Top tags: embedding, vector, api-route. Risk: medium.
cluster:: cluster-82
cluster_id:: 82
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: embedding, vector, api-route, auth, analytics
## Agent hints
Use this cluster when investigating embedding, vector, api-route.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-18]] (jaccard 0.67)
- same:: [[Clusters/cluster-59]] (jaccard 0.60)
- same:: [[Clusters/cluster-9]] (jaccard 0.50)
- same:: [[Clusters/cluster-48]] (jaccard 0.50)
- same:: [[Clusters/cluster-6]] (jaccard 0.43)
## Top Directories
- `src/lib/server/grpc` (10)
- `src/lib/server/training` (2)
- `src/lib/server/mcp` (1)
## Top Tags
- embedding (9)
- vector (7)
- api-route (3)
- auth (2)
- analytics (2)
## Members (8)
- contains:: [[Files/src__lib__server__grpc__tool-calling-client|src/lib/server/grpc/tool-calling-client.ts]]
- contains:: [[Files/src__lib__server__grpc__tool-router-client|src/lib/server/grpc/tool-router-client.ts]]
- contains:: [[Files/src__lib__server__training__query-logger|src/lib/server/training/query-logger.ts]]
- contains:: [[Files/src__lib__server__grpc__retrieval-client|src/lib/server/grpc/retrieval-client.ts]]
- contains:: [[Files/src__lib__server__mcp__mcp-internal|src/lib/server/mcp/mcp-internal.ts]]
- contains:: [[Files/src__lib__server__gpu__mapreduce-cuda-analyzer|src/lib/server/gpu/mapreduce-cuda-analyzer.ts]]
- contains:: [[Files/src__lib__server__grpc__codeintel-client|src/lib/server/grpc/codeintel-client.ts]]
- contains:: [[Files/src__lib__server__retrieval__codebase-context|src/lib/server/retrieval/codebase-context.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 82 SORT pagerank DESC LIMIT 30
```