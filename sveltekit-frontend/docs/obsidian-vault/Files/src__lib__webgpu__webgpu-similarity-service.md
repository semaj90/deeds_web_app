---
type: "file"
path: "src/lib/webgpu/webgpu-similarity-service.ts"
aliases: ["webgpu-similarity-service.ts","src/lib/webgpu/webgpu-similarity-service.ts"]
clusterId: 20
ext: ".ts"
lineCount: 146
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/webgpu/webgpu-similarity-service.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-20]]"]
imports: ["[[Files/webgpu-similarity-engine]]"]
tags: ["file","ext/ts","cluster/20","t/ts","t/src","t/lib"]
---

# `src/lib/webgpu/webgpu-similarity-service.ts`
## For future Claude
> High-level similarity search service using WebGPU acceleration
cluster:: [[Clusters/cluster-20]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 146
## Summary

High-level similarity search service using WebGPU acceleration

## Imports

- imports:: [[Files/webgpu-similarity-engine]] `./webgpu-similarity-engine.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```