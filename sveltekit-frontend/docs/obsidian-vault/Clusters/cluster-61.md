---
type: "cluster"
cluster_id: "cluster-61"
clusterId: 61
topic: "const chunks in `src/lib/server/concurrency` (tag: auth)"
aliases: ["cluster-61","const chunks in `src/lib/server/concurrency` (tag: auth)"]
memberCount: 1
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["auth"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
contains: ["[[Files/src__lib__server__concurrency__advisory-locks]]"]
same: ["[[Clusters/cluster-33]]","[[Clusters/cluster-14]]","[[Clusters/cluster-15]]","[[Clusters/cluster-59]]","[[Clusters/cluster-90]]"]
tags: ["cluster","cluster/61"]
---

# const chunks in `src/lib/server/concurrency` (tag: auth)
## For future Claude
> Cluster of 1 files. Top dirs: src/lib/server/concurrency. Top tags: auth. Risk: medium.
cluster:: cluster-61
cluster_id:: 61
member_count:: 1
pagerank_sum:: 0
risk:: medium
top_tags:: auth
## Agent hints
Use this cluster when investigating auth.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-33]] (jaccard 1.00)
- same:: [[Clusters/cluster-14]] (jaccard 0.33)
- same:: [[Clusters/cluster-15]] (jaccard 0.33)
- same:: [[Clusters/cluster-59]] (jaccard 0.33)
- same:: [[Clusters/cluster-90]] (jaccard 0.33)
## Top Directories
- `src/lib/server/concurrency` (1)
## Top Tags
- auth (1)
## Members (1)
- contains:: [[Files/src__lib__server__concurrency__advisory-locks|src/lib/server/concurrency/advisory-locks.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 61 SORT pagerank DESC LIMIT 30
```