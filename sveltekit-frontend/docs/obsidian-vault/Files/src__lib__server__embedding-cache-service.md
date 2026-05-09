---
type: "file"
path: "src/lib/server/embedding-cache-service.ts"
aliases: ["embedding-cache-service.ts","src/lib/server/embedding-cache-service.ts"]
clusterId: 6
ext: ".ts"
lineCount: 253
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/embedding-cache-service.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/redis-service]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/embedding-cache-service.ts`
## For future Claude
> Enhanced Embedding Cache Service
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 253
## Summary

Enhanced Embedding Cache Service

## Imports

- imports:: [[Files/redis-service]] `./redis-service.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```