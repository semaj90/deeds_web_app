---
type: "file"
path: "src/lib/server/batch-embedder.ts"
aliases: ["batch-embedder.ts","src/lib/server/batch-embedder.ts"]
clusterId: 6
ext: ".ts"
lineCount: 192
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/batch-embedder.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/env]]","[[Files/embedding-cache]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/batch-embedder.ts`
## For future Claude
> Batch embedding service with automatic batching window
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 192
## Summary

Batch embedding service with automatic batching window

## Imports

- imports:: [[Files/env]] `./env.server.js`
- imports:: [[Files/embedding-cache]] `./embedding-cache.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```