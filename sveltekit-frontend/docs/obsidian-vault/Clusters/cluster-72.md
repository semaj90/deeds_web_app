---
type: "cluster"
cluster_id: "cluster-72"
clusterId: 72
topic: "function chunks in `src/lib/server/ace` (tag: vector)"
aliases: ["cluster-72","function chunks in `src/lib/server/ace` (tag: vector)"]
memberCount: 1186
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["vector","embedding","redis","auth","ai"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__routes__api__graph__recommendations___server]]","[[Files/src__lib__server__ace__policy]]","[[Files/src__lib__server__ace__context-assembler]]","[[Files/src__lib__server__ace__ace-wiki]]","[[Files/src__lib__server__retrieval__codebase-context]]","[[Files/src__lib__types__rag-source-validation]]","[[Files/src__lib__server__ai__langgraph-research]]","[[Files/src__lib__server__llm__ollama-client]]"]
same: ["[[Clusters/cluster-46]]","[[Clusters/cluster-19]]","[[Clusters/cluster-20]]","[[Clusters/cluster-21]]","[[Clusters/cluster-29]]"]
tags: ["cluster","cluster/72","topic/topic_vector","topic/auth"]
---

# function chunks in `src/lib/server/ace` (tag: vector)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/ace, src/lib/server/retrieval, src/lib/server/ai. Top tags: vector, embedding, redis. Risk: medium.
cluster:: cluster-72
cluster_id:: 72
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: vector, embedding, redis, auth, ai
## Agent hints
Use this cluster when investigating vector, embedding, redis.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-46]] (jaccard 0.80)
- same:: [[Clusters/cluster-19]] (jaccard 0.67)
- same:: [[Clusters/cluster-20]] (jaccard 0.67)
- same:: [[Clusters/cluster-21]] (jaccard 0.67)
- same:: [[Clusters/cluster-29]] (jaccard 0.67)
## Top Directories
- `src/lib/server/ace` (5)
- `src/lib/server/retrieval` (3)
- `src/lib/server/ai` (3)
## Top Tags
- vector (11)
- embedding (11)
- redis (7)
- auth (4)
- ai (3)
## Members (8)
- contains:: [[Files/src__routes__api__graph__recommendations___server|src/routes/api/graph/recommendations/+server.ts]]
- contains:: [[Files/src__lib__server__ace__policy|src/lib/server/ace/policy.ts]]
- contains:: [[Files/src__lib__server__ace__context-assembler|src/lib/server/ace/context-assembler.ts]]
- contains:: [[Files/src__lib__server__ace__ace-wiki|src/lib/server/ace/ace-wiki.ts]]
- contains:: [[Files/src__lib__server__retrieval__codebase-context|src/lib/server/retrieval/codebase-context.ts]]
- contains:: [[Files/src__lib__types__rag-source-validation|src/lib/types/rag-source-validation.ts]]
- contains:: [[Files/src__lib__server__ai__langgraph-research|src/lib/server/ai/langgraph-research.ts]]
- contains:: [[Files/src__lib__server__llm__ollama-client|src/lib/server/llm/ollama-client.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 72 SORT pagerank DESC LIMIT 30
```