---
type: "cluster"
cluster_id: "cluster-32"
clusterId: 32
topic: "function chunks in `src/lib/server/services` (tag: api-route)"
aliases: ["cluster-32","function chunks in `src/lib/server/services` (tag: api-route)"]
memberCount: 540
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["api-route","server-module","redis","vector","schema"]
llmHits: 0
summaryMode: null
confidence: "low"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__services__langextract-service]]","[[Files/src__lib__server__langextract-client]]","[[Files/src__lib__server__analysis__entity-extraction]]","[[Files/src__lib__server__tools__handlers__langextractbatch]]","[[Files/src__lib__server__keyword-extractor]]","[[Files/src__lib__server__retrieval__wikipedia-search]]","[[Files/src__lib__schemas__tools__langextract-batch.schema]]","[[Files/src__lib__server__evidence__services__entity-extractor]]"]
same: ["[[Clusters/cluster-17]]","[[Clusters/cluster-20]]","[[Clusters/cluster-43]]","[[Clusters/cluster-51]]","[[Clusters/cluster-60]]"]
tags: ["cluster","cluster/32"]
---

# function chunks in `src/lib/server/services` (tag: api-route)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/server/services, src/lib/server, src/lib/server/analysis. Top tags: api-route, server-module, redis. Risk: medium.
cluster:: cluster-32
cluster_id:: 32
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: api-route, server-module, redis, vector, schema
## Agent hints
Use this cluster when investigating api-route, server-module, redis.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-17]] (jaccard 0.43)
- same:: [[Clusters/cluster-20]] (jaccard 0.43)
- same:: [[Clusters/cluster-43]] (jaccard 0.43)
- same:: [[Clusters/cluster-51]] (jaccard 0.43)
- same:: [[Clusters/cluster-60]] (jaccard 0.43)
## Top Directories
- `src/lib/server/services` (6)
- `src/lib/server` (4)
- `src/lib/server/analysis` (1)
## Top Tags
- api-route (5)
- server-module (3)
- redis (2)
- vector (2)
- schema (1)
## Members (8)
- contains:: [[Files/src__lib__server__services__langextract-service|src/lib/server/services/langextract-service.ts]]
- contains:: [[Files/src__lib__server__langextract-client|src/lib/server/langextract-client.ts]]
- contains:: [[Files/src__lib__server__analysis__entity-extraction|src/lib/server/analysis/entity-extraction.ts]]
- contains:: [[Files/src__lib__server__tools__handlers__langextractbatch|src/lib/server/tools/handlers/langextractBatch.ts]]
- contains:: [[Files/src__lib__server__keyword-extractor|src/lib/server/keyword-extractor.ts]]
- contains:: [[Files/src__lib__server__retrieval__wikipedia-search|src/lib/server/retrieval/wikipedia-search.ts]]
- contains:: [[Files/src__lib__schemas__tools__langextract-batch.schema|src/lib/schemas/tools/langextract-batch.schema.json]]
- contains:: [[Files/src__lib__server__evidence__services__entity-extractor|src/lib/server/evidence/services/entity-extractor.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 32 SORT pagerank DESC LIMIT 30
```