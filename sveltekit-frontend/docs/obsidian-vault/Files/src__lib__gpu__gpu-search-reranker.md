---
type: "file"
path: "src/lib/gpu/gpu-search-reranker.ts"
aliases: ["gpu-search-reranker.ts","src/lib/gpu/gpu-search-reranker.ts"]
clusterId: 17
ext: ".ts"
lineCount: 178
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/gpu/gpu-search-reranker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: ["[[Files/gpu-compute-pipeline]]"]
tags: ["file","ext/ts","cluster/17","t/ts","t/src","t/lib"]
---

# `src/lib/gpu/gpu-search-reranker.ts`
## For future Claude
> GPU Search Reranker — Client-side reranking via WebGPU compute
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 178
## Summary

GPU Search Reranker — Client-side reranking via WebGPU compute

## Imports

- imports:: [[Files/gpu-compute-pipeline]] `./gpu-compute-pipeline.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```