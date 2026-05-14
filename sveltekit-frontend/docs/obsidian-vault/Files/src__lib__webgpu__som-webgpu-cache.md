---
type: "file"
path: "src/lib/webgpu/som-webgpu-cache.ts"
aliases: ["som-webgpu-cache.ts","src/lib/webgpu/som-webgpu-cache.ts"]
clusterId: -1
ext: ".ts"
lineCount: 818
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/webgpu/som-webgpu-cache.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/webgpu/som-webgpu-cache.ts`
## For future Claude
> Retrieve all embeddings for a specific case from IndexDB
pagerank:: 0.000000
blend:: 0.000000
lines:: 818
## Summary

Retrieve all embeddings for a specific case from IndexDB

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```