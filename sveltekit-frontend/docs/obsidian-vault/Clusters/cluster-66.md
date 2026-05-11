---
type: "cluster"
cluster_id: "cluster-66"
clusterId: 66
topic: "type chunks in `src/lib/server/services` (tag: types)"
aliases: ["cluster-66","type chunks in `src/lib/server/services` (tag: types)"]
memberCount: 12
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["types","redis","embedding","server-module","ui-component"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__server__evidence__proto-serializer]]","[[Files/src__lib__server__analysis__entity-extraction]]","[[Files/src__lib__server__langextract-client]]","[[Files/src__lib__server__evidence__services__entity-extractor]]","[[Files/src__lib__server__services__langextract-service]]","[[Files/src__lib__types__ai]]"]
same: ["[[Clusters/cluster-78]]","[[Clusters/cluster-56]]","[[Clusters/cluster-1]]","[[Clusters/cluster-4]]","[[Clusters/cluster-17]]"]
tags: ["cluster","cluster/66","topic/services","topic/sym_extract","topic/evidence","topic/types"]
---

# type chunks in `src/lib/server/services` (tag: types)
## For future Claude
> Cluster of 6 files. Top dirs: src/lib/server/services, src/lib/server, src/lib/server/evidence. Top tags: types, redis, embedding. Risk: medium.
cluster:: cluster-66
cluster_id:: 66
member_count:: 6
pagerank_sum:: 0
risk:: medium
top_tags:: types, redis, embedding, server-module, ui-component
## Agent hints
Use this cluster when investigating types, redis, embedding.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-78]] (jaccard 0.67)
- same:: [[Clusters/cluster-56]] (jaccard 0.50)
- same:: [[Clusters/cluster-1]] (jaccard 0.43)
- same:: [[Clusters/cluster-4]] (jaccard 0.43)
- same:: [[Clusters/cluster-17]] (jaccard 0.43)
## Top Directories
- `src/lib/server/services` (4)
- `src/lib/server` (3)
- `src/lib/server/evidence` (2)
## Top Tags
- types (5)
- redis (1)
- embedding (1)
- server-module (1)
- ui-component (1)
## Members (6)
- contains:: [[Files/src__lib__server__evidence__proto-serializer|src/lib/server/evidence/proto-serializer.ts]]
- contains:: [[Files/src__lib__server__analysis__entity-extraction|src/lib/server/analysis/entity-extraction.ts]]
- contains:: [[Files/src__lib__server__langextract-client|src/lib/server/langextract-client.ts]]
- contains:: [[Files/src__lib__server__evidence__services__entity-extractor|src/lib/server/evidence/services/entity-extractor.ts]]
- contains:: [[Files/src__lib__server__services__langextract-service|src/lib/server/services/langextract-service.ts]]
- contains:: [[Files/src__lib__types__ai|src/lib/types/ai.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 66 SORT pagerank DESC LIMIT 30
```