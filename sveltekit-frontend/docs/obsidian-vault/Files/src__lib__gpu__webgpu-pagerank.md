---
type: "file"
path: "src/lib/gpu/webgpu-pagerank.ts"
aliases: ["webgpu-pagerank.ts","src/lib/gpu/webgpu-pagerank.ts"]
clusterId: 17
ext: ".ts"
lineCount: 422
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/gpu/webgpu-pagerank.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: []
tags: ["file","ext/ts","cluster/17","zod","t/ts","t/src","t/lib"]
---

# `src/lib/gpu/webgpu-pagerank.ts`
## For future Claude
> WebGPU PageRank Bridge — browser-side power-iteration
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 422
## Summary

WebGPU PageRank Bridge — browser-side power-iteration

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```