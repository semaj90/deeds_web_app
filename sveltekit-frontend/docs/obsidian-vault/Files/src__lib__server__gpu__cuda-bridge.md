---
type: "file"
path: "src/lib/server/gpu/cuda-bridge.ts"
aliases: ["cuda-bridge.ts","src/lib/server/gpu/cuda-bridge.ts"]
clusterId: 20
ext: ".ts"
lineCount: 99
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/gpu/cuda-bridge.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-20]]"]
imports: ["[[Files/libtorch-bridge]]"]
tags: ["file","ext/ts","cluster/20","t/ts","t/src","t/lib"]
---

# `src/lib/server/gpu/cuda-bridge.ts`
## For future Claude
> CUDA Compute Bridge for RTX 3060 Ti
cluster:: [[Clusters/cluster-20]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 99
## Summary

CUDA Compute Bridge for RTX 3060 Ti

## Imports

- imports:: [[Files/libtorch-bridge]] `./libtorch-bridge.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```