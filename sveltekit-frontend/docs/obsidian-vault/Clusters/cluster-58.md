---
type: "cluster"
cluster_id: "cluster-58"
clusterId: 58
topic: "type chunks in `src/lib/server/indexer` (tag: vector)"
aliases: ["cluster-58","type chunks in `src/lib/server/indexer` (tag: vector)"]
memberCount: 10
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["vector","embedding","xstate","auth","schema"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__machines__retrieval-machine]]","[[Files/src__lib__server__indexer__ast-chunker]]","[[Files/src__lib__server__retrieval__codebase-context]]","[[Files/src__lib__types__rag]]","[[Files/src__lib__server__grpc__retrieval-client]]","[[Files/src__lib__server__phase78__contextbuilder]]","[[Files/src__lib__server__inference__inference-router]]","[[Files/src__lib__server__research__web-research-ingester]]"]
same: ["[[Clusters/cluster-20]]","[[Clusters/cluster-59]]","[[Clusters/cluster-48]]","[[Clusters/cluster-6]]","[[Clusters/cluster-10]]"]
tags: ["cluster","cluster/58","topic/topic_vector","topic/auth"]
---

# type chunks in `src/lib/server/indexer` (tag: vector)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/indexer, src/lib/machines, src/lib/server/retrieval. Top tags: vector, embedding, xstate. Risk: medium.
cluster:: cluster-58
cluster_id:: 58
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: vector, embedding, xstate, auth, schema
## Agent hints
Use this cluster when investigating vector, embedding, xstate.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-20]] (jaccard 0.67)
- same:: [[Clusters/cluster-59]] (jaccard 0.60)
- same:: [[Clusters/cluster-48]] (jaccard 0.50)
- same:: [[Clusters/cluster-6]] (jaccard 0.43)
- same:: [[Clusters/cluster-10]] (jaccard 0.43)
## Top Directories
- `src/lib/server/indexer` (2)
- `src/lib/machines` (1)
- `src/lib/server/retrieval` (1)
## Top Tags
- vector (7)
- embedding (7)
- xstate (3)
- auth (3)
- schema (2)
## Members (8)
- contains:: [[Files/src__lib__machines__retrieval-machine|src/lib/machines/retrieval-machine.ts]]
- contains:: [[Files/src__lib__server__indexer__ast-chunker|src/lib/server/indexer/ast-chunker.ts]]
- contains:: [[Files/src__lib__server__retrieval__codebase-context|src/lib/server/retrieval/codebase-context.ts]]
- contains:: [[Files/src__lib__types__rag|src/lib/types/rag.ts]]
- contains:: [[Files/src__lib__server__grpc__retrieval-client|src/lib/server/grpc/retrieval-client.ts]]
- contains:: [[Files/src__lib__server__phase78__contextbuilder|src/lib/server/phase78/contextBuilder.ts]]
- contains:: [[Files/src__lib__server__inference__inference-router|src/lib/server/inference/inference-router.ts]]
- contains:: [[Files/src__lib__server__research__web-research-ingester|src/lib/server/research/web-research-ingester.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 58 SORT pagerank DESC LIMIT 30
```