---
type: "cluster"
cluster_id: "cluster-59"
clusterId: 59
topic: "function chunks in `src/lib/server/observability` (tag: vector)"
aliases: ["cluster-59","function chunks in `src/lib/server/observability` (tag: vector)"]
memberCount: 36
pagerank_sum: 0.241103
pagerank_max: 0.241103
risk: "high"
top_tags: ["vector","embedding","auth"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__observability__inference-log]]","[[Files/src__lib__components__evidence__board-persistence.svelte]]"]
same: ["[[Clusters/cluster-48]]","[[Clusters/cluster-12]]","[[Clusters/cluster-71]]","[[Clusters/cluster-6]]","[[Clusters/cluster-20]]"]
tags: ["cluster","cluster/59"]
---

# function chunks in `src/lib/server/observability` (tag: vector)
## For future Claude
> Cluster of 2 files. Top dirs: src/lib/server/observability, src/lib/components/evidence. Top tags: vector, embedding, auth. Risk: high.
cluster:: cluster-59
cluster_id:: 59
member_count:: 2
pagerank_sum:: 0.241103
risk:: high
top_tags:: vector, embedding, auth
## Agent hints
Use this cluster when investigating vector, embedding, auth.
Risk: **high** (pagerank_max=0.241103, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-48]] (jaccard 0.75)
- same:: [[Clusters/cluster-12]] (jaccard 0.67)
- same:: [[Clusters/cluster-71]] (jaccard 0.67)
- same:: [[Clusters/cluster-6]] (jaccard 0.60)
- same:: [[Clusters/cluster-20]] (jaccard 0.60)
## Top Directories
- `src/lib/server/observability` (4)
- `src/lib/components/evidence` (1)
## Top Tags
- vector (4)
- embedding (4)
- auth (1)
## Members (2)
- contains:: [[Files/src__lib__server__observability__inference-log|src/lib/server/observability/inference-log.ts]]
- contains:: [[Files/src__lib__components__evidence__board-persistence.svelte|src/lib/components/evidence/board-persistence.svelte.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 59 SORT pagerank DESC LIMIT 30
```