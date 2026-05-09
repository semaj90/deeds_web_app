---
type: "file"
path: "src/lib/workers/gpu-worker.mjs"
aliases: ["gpu-worker.mjs","src/lib/workers/gpu-worker.mjs"]
clusterId: 57
ext: ".mjs"
lineCount: 115
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/workers/gpu-worker.mjs"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: []
tags: ["file","ext/mjs","cluster/57","t/mjs","t/src","t/lib"]
---

# `src/lib/workers/gpu-worker.mjs`
## For future Claude
> GPU Worker — offloads heavy synchronous N-API addon calls off the main event loop.
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 115
## Summary

GPU Worker — offloads heavy synchronous N-API addon calls off the main event loop.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```