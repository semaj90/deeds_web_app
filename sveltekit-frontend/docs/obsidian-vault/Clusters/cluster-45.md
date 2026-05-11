---
type: "cluster"
cluster_id: "cluster-45"
clusterId: 45
topic: "function chunks in `src/lib/server/ai` (tag: ai)"
aliases: ["cluster-45","function chunks in `src/lib/server/ai` (tag: ai)"]
memberCount: 3
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["ai","embedding"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__ai__ollama-config]]"]
same: ["[[Clusters/cluster-87]]","[[Clusters/cluster-14]]","[[Clusters/cluster-39]]","[[Clusters/cluster-46]]","[[Clusters/cluster-93]]"]
tags: ["cluster","cluster/45"]
---

# function chunks in `src/lib/server/ai` (tag: ai)
## For future Claude
> Cluster of 1 files. Top dirs: src/lib/server/ai. Top tags: ai, embedding. Risk: medium.
cluster:: cluster-45
cluster_id:: 45
member_count:: 1
pagerank_sum:: 0
risk:: medium
top_tags:: ai, embedding
## Agent hints
Use this cluster when investigating ai, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-87]] (jaccard 1.00)
- same:: [[Clusters/cluster-14]] (jaccard 0.67)
- same:: [[Clusters/cluster-39]] (jaccard 0.50)
- same:: [[Clusters/cluster-46]] (jaccard 0.50)
- same:: [[Clusters/cluster-93]] (jaccard 0.50)
## Top Directories
- `src/lib/server/ai` (1)
## Top Tags
- ai (1)
- embedding (1)
## Members (1)
- contains:: [[Files/src__lib__server__ai__ollama-config|src/lib/server/ai/ollama-config.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 45 SORT pagerank DESC LIMIT 30
```