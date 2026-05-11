---
type: "cluster"
cluster_id: "cluster-99"
clusterId: 99
topic: "function chunks in `src/lib/server/image` (tag: embedding)"
aliases: ["cluster-99","function chunks in `src/lib/server/image` (tag: embedding)"]
memberCount: 26
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["embedding"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__image__resize-for-vlm]]"]
same: ["[[Clusters/cluster-39]]","[[Clusters/cluster-93]]","[[Clusters/cluster-97]]","[[Clusters/cluster-12]]","[[Clusters/cluster-45]]"]
tags: ["cluster","cluster/99"]
---

# function chunks in `src/lib/server/image` (tag: embedding)
## For future Claude
> Cluster of 1 files. Top dirs: src/lib/server/image. Top tags: embedding. Risk: medium.
cluster:: cluster-99
cluster_id:: 99
member_count:: 1
pagerank_sum:: 0
risk:: medium
top_tags:: embedding
## Agent hints
Use this cluster when investigating embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-39]] (jaccard 1.00)
- same:: [[Clusters/cluster-93]] (jaccard 1.00)
- same:: [[Clusters/cluster-97]] (jaccard 1.00)
- same:: [[Clusters/cluster-12]] (jaccard 0.50)
- same:: [[Clusters/cluster-45]] (jaccard 0.50)
## Top Directories
- `src/lib/server/image` (2)
## Top Tags
- embedding (1)
## Members (1)
- contains:: [[Files/src__lib__server__image__resize-for-vlm|src/lib/server/image/resize-for-vlm.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 99 SORT pagerank DESC LIMIT 30
```