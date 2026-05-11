---
type: "cluster"
cluster_id: "cluster-29"
clusterId: 29
topic: "const chunks in `src/lib/schemas` (tag: auth)"
aliases: ["cluster-29","const chunks in `src/lib/schemas` (tag: auth)"]
memberCount: 455
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["auth","types","embedding","vector","redis"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__stores__unified__evidence-store.svelte]]","[[Files/src__lib__types__global]]","[[Files/src__lib__schemas__evidence]]","[[Files/src__lib__types__database]]","[[Files/src__routes___app___evidence__schema]]","[[Files/src__lib__data__types]]","[[Files/src__lib__components__evidence__evidence-utils]]","[[Files/src__lib__schemas__evidence-upload]]"]
same: ["[[Clusters/cluster-74]]","[[Clusters/cluster-56]]","[[Clusters/cluster-20]]","[[Clusters/cluster-72]]","[[Clusters/cluster-77]]"]
tags: ["cluster","cluster/29"]
---

# const chunks in `src/lib/schemas` (tag: auth)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/schemas, src/lib/types, src/routes/(app)/evidence. Top tags: auth, types, embedding. Risk: medium.
cluster:: cluster-29
cluster_id:: 29
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: auth, types, embedding, vector, redis
## Agent hints
Use this cluster when investigating auth, types, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-74]] (jaccard 1.00)
- same:: [[Clusters/cluster-56]] (jaccard 0.80)
- same:: [[Clusters/cluster-20]] (jaccard 0.67)
- same:: [[Clusters/cluster-72]] (jaccard 0.67)
- same:: [[Clusters/cluster-77]] (jaccard 0.67)
## Top Directories
- `src/lib/schemas` (3)
- `src/lib/types` (2)
- `src/routes/(app)/evidence` (2)
## Top Tags
- auth (3)
- types (2)
- embedding (2)
- vector (1)
- redis (1)
## Members (8)
- contains:: [[Files/src__lib__stores__unified__evidence-store.svelte|src/lib/stores/unified/evidence-store.svelte.ts]]
- contains:: [[Files/src__lib__types__global|src/lib/types/global.ts]]
- contains:: [[Files/src__lib__schemas__evidence|src/lib/schemas/evidence.ts]]
- contains:: [[Files/src__lib__types__database|src/lib/types/database.ts]]
- contains:: [[Files/src__routes___app___evidence__schema|src/routes/(app)/evidence/schema.ts]]
- contains:: [[Files/src__lib__data__types|src/lib/data/types.ts]]
- contains:: [[Files/src__lib__components__evidence__evidence-utils|src/lib/components/evidence/evidence-utils.ts]]
- contains:: [[Files/src__lib__schemas__evidence-upload|src/lib/schemas/evidence-upload.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 29 SORT pagerank DESC LIMIT 30
```