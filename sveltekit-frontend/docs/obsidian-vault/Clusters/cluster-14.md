---
type: "cluster"
cluster_id: "cluster-14"
clusterId: 14
topic: "function chunks in `src/lib/ai` (tag: ai)"
aliases: ["cluster-14","function chunks in `src/lib/ai` (tag: ai)"]
memberCount: 1
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["ai","auth","embedding"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__ai__client-embed]]"]
same: ["[[Clusters/cluster-45]]","[[Clusters/cluster-87]]","[[Clusters/cluster-5]]","[[Clusters/cluster-21]]","[[Clusters/cluster-72]]"]
tags: ["cluster","cluster/14","topic/auth"]
---

# function chunks in `src/lib/ai` (tag: ai)
## For future Claude
> This cluster provides utility functions and client-side logic for advanced AI tasks, including stable softmax calculation, WebGPU context management, image preprocessing for VLM, and specialized data parsing for genomic/cartridge data.

**Purpose:** AI/ML Utility and Client Infrastructure
cluster:: cluster-14
cluster_id:: 14
member_count:: 1
pagerank_sum:: 0
risk:: low
top_tags:: ai, auth, embedding
## Agent hints
Use this cluster when investigating ai, auth, embedding.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-45]] (jaccard 0.67)
- same:: [[Clusters/cluster-87]] (jaccard 0.67)
- same:: [[Clusters/cluster-5]] (jaccard 0.60)
- same:: [[Clusters/cluster-21]] (jaccard 0.60)
- same:: [[Clusters/cluster-72]] (jaccard 0.60)
## Top Directories
- `src/lib/ai` (1)
## Top Tags
- ai (1)
- auth (1)
- embedding (1)
## Members (1)
- contains:: [[Files/src__lib__ai__client-embed|src/lib/ai/client-embed.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 14 SORT pagerank DESC LIMIT 30
```