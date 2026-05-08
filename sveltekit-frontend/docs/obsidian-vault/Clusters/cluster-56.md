---
type: "cluster"
cluster_id: "cluster-56"
clusterId: 56
topic: "type chunks in `src/lib/server` (tag: embedding)"
aliases: ["cluster-56","type chunks in `src/lib/server` (tag: embedding)"]
memberCount: 10
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["embedding","vector","redis","types"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__docling]]","[[Files/src__lib__server__embeddings__ollama]]","[[Files/src__lib__types__evidence]]","[[Files/src__lib__shared__types__parser]]","[[Files/src__lib__server__db-shim]]"]
same: ["[[Clusters/cluster-29]]","[[Clusters/cluster-74]]","[[Clusters/cluster-78]]","[[Clusters/cluster-96]]","[[Clusters/cluster-0]]"]
tags: ["cluster","cluster/56","topic/types","topic/sym_ollama","topic/sym_evidence"]
---

# type chunks in `src/lib/server` (tag: embedding)
## For future Claude
> This cluster is architected for advanced document intelligence and legal data processing. It implements a multi-stage pipeline that handles document parsing, visual language model (VLM) extraction, and subsequent embedding generation for vector storage. The system is designed to extract structured data, analyze evidence, and provide detailed processing metrics.

**Purpose:** Document Intelligence and Legal Data Processing Pipeline
cluster:: cluster-56
cluster_id:: 56
member_count:: 5
pagerank_sum:: 0
risk:: low
top_tags:: embedding, vector, redis, types
## Agent hints
Use this cluster when investigating embedding, vector, redis.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-29]] (jaccard 0.80)
- same:: [[Clusters/cluster-74]] (jaccard 0.80)
- same:: [[Clusters/cluster-78]] (jaccard 0.80)
- same:: [[Clusters/cluster-96]] (jaccard 0.80)
- same:: [[Clusters/cluster-0]] (jaccard 0.75)
## Top Directories
- `src/lib/server` (4)
- `src/lib/server/embeddings` (1)
- `src/lib/types` (1)
## Top Tags
- embedding (2)
- vector (1)
- redis (1)
- types (1)
## Members (5)
- contains:: [[Files/src__lib__server__docling|src/lib/server/docling.ts]]
- contains:: [[Files/src__lib__server__embeddings__ollama|src/lib/server/embeddings/ollama.ts]]
- contains:: [[Files/src__lib__types__evidence|src/lib/types/evidence.ts]]
- contains:: [[Files/src__lib__shared__types__parser|src/lib/shared/types/parser.ts]]
- contains:: [[Files/src__lib__server__db-shim|src/lib/server/db-shim.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 56 SORT pagerank DESC LIMIT 30
```