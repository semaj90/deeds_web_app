---
type: "cluster"
cluster_id: "cluster-57"
clusterId: 57
topic: "const chunks in `src/lib/shims` (tag: embedding)"
aliases: ["cluster-57","const chunks in `src/lib/shims` (tag: embedding)"]
memberCount: 1099
pagerank_sum: 0.20716
pagerank_max: 0.20716
risk: "high"
top_tags: ["embedding","vector","auth","server-module","config"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__server__vector__multi-store]]","[[Files/src__lib__stores.svelte]]","[[Files/src__lib__utils__route-operation-logger]]","[[Files/src__lib__shims__worker-threads-browser-shim]]","[[Files/src__lib__server__gpu__libtorch-bridge]]","[[Files/src__lib__stores__unified__index.svelte]]","[[Files/src__lib__db__pool]]","[[Files/src__lib__server__retrieval__context-buffer]]"]
same: ["[[Clusters/cluster-52]]","[[Clusters/cluster-59]]","[[Clusters/cluster-48]]","[[Clusters/cluster-6]]","[[Clusters/cluster-17]]"]
tags: ["cluster","cluster/57","topic/sym_store","topic/auth"]
---

# const chunks in `src/lib/shims` (tag: embedding)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/shims, src/lib/server/vector, src/lib. Top tags: embedding, vector, auth. Risk: high.
cluster:: cluster-57
cluster_id:: 57
member_count:: 8
pagerank_sum:: 0.20716
risk:: high
top_tags:: embedding, vector, auth, server-module, config
## Agent hints
Use this cluster when investigating embedding, vector, auth.
Risk: **high** (pagerank_max=0.20716, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-52]] (jaccard 0.67)
- same:: [[Clusters/cluster-59]] (jaccard 0.60)
- same:: [[Clusters/cluster-48]] (jaccard 0.50)
- same:: [[Clusters/cluster-6]] (jaccard 0.43)
- same:: [[Clusters/cluster-17]] (jaccard 0.43)
## Top Directories
- `src/lib/shims` (3)
- `src/lib/server/vector` (2)
- `src/lib` (1)
## Top Tags
- embedding (5)
- vector (3)
- auth (3)
- server-module (3)
- config (3)
## Members (8)
- contains:: [[Files/src__lib__server__vector__multi-store|src/lib/server/vector/multi-store.ts]]
- contains:: [[Files/src__lib__stores.svelte|src/lib/stores.svelte.ts]]
- contains:: [[Files/src__lib__utils__route-operation-logger|src/lib/utils/route-operation-logger.ts]]
- contains:: [[Files/src__lib__shims__worker-threads-browser-shim|src/lib/shims/worker-threads-browser-shim.js]]
- contains:: [[Files/src__lib__server__gpu__libtorch-bridge|src/lib/server/gpu/libtorch-bridge.ts]]
- contains:: [[Files/src__lib__stores__unified__index.svelte|src/lib/stores/unified/index.svelte.ts]]
- contains:: [[Files/src__lib__db__pool|src/lib/db/pool.ts]]
- contains:: [[Files/src__lib__server__retrieval__context-buffer|src/lib/server/retrieval/context-buffer.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 57 SORT pagerank DESC LIMIT 30
```