---
type: "cluster"
cluster_id: "cluster-39"
clusterId: 39
topic: "function chunks in `src/lib/server/analysis` (tag: embedding)"
aliases: ["cluster-39","function chunks in `src/lib/server/analysis` (tag: embedding)"]
memberCount: 23
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["embedding"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__analysis__analysis-jobs]]","[[Files/src__lib__server__evidence-progress]]","[[Files/src__lib__server__ace-ingest-progress]]"]
same: ["[[Clusters/cluster-93]]","[[Clusters/cluster-97]]","[[Clusters/cluster-99]]","[[Clusters/cluster-12]]","[[Clusters/cluster-45]]"]
tags: ["cluster","cluster/39","topic/analysis","topic/sym_job","topic/sym_update"]
---

# function chunks in `src/lib/server/analysis` (tag: embedding)
## For future Claude
> Cluster of 3 files. Top dirs: src/lib/server/analysis, src/lib/server. Top tags: embedding. Risk: medium.
cluster:: cluster-39
cluster_id:: 39
member_count:: 3
pagerank_sum:: 0
risk:: medium
top_tags:: embedding
## Agent hints
Use this cluster when investigating embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-93]] (jaccard 1.00)
- same:: [[Clusters/cluster-97]] (jaccard 1.00)
- same:: [[Clusters/cluster-99]] (jaccard 1.00)
- same:: [[Clusters/cluster-12]] (jaccard 0.50)
- same:: [[Clusters/cluster-45]] (jaccard 0.50)
## Top Directories
- `src/lib/server/analysis` (3)
- `src/lib/server` (2)
## Top Tags
- embedding (2)
## Members (3)
- contains:: [[Files/src__lib__server__analysis__analysis-jobs|src/lib/server/analysis/analysis-jobs.ts]]
- contains:: [[Files/src__lib__server__evidence-progress|src/lib/server/evidence-progress.ts]]
- contains:: [[Files/src__lib__server__ace-ingest-progress|src/lib/server/ace-ingest-progress.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 39 SORT pagerank DESC LIMIT 30
```