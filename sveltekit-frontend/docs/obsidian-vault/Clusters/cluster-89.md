---
type: "cluster"
cluster_id: "cluster-89"
clusterId: 89
topic: "function chunks in `src/lib/server/legal`"
aliases: ["cluster-89","function chunks in `src/lib/server/legal`"]
memberCount: 41
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: []
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__legal__constitution-registry]]"]
same: []
tags: ["cluster","cluster/89","topic/legal","topic/topic_legal","topic/sym_get"]
---

# function chunks in `src/lib/server/legal`
## For future Claude
> This cluster manages the ingestion, storage, and analysis of state constitutional law data across the US. It maintains a comprehensive registry of state sources and provides utilities for fetching, mapping, and tagging constitutional texts based on defined legal patterns. The system is designed to handle diverse data formats and varying levels of source reliability.

**Purpose:** Legal Data Ingestion and Analysis Pipeline
cluster:: cluster-89
cluster_id:: 89
member_count:: 1
pagerank_sum:: 0
risk:: low
top_tags:: 
## Agent hints
Use this cluster when investigating these files.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
_no strongly-related clusters_
## Top Directories
- `src/lib/server/legal` (3)
## Top Tags
## Members (1)
- contains:: [[Files/src__lib__server__legal__constitution-registry|src/lib/server/legal/constitution-registry.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 89 SORT pagerank DESC LIMIT 30
```