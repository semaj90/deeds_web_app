---
type: "file"
path: "src/lib/server/vector-cache.ts"
aliases: ["vector-cache.ts","src/lib/server/vector-cache.ts"]
clusterId: 94
ext: ".ts"
lineCount: 496
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/vector-cache.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-94]]"]
imports: ["[[Files/redis-service]]"]
tags: ["file","ext/ts","cluster/94","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/vector-cache.ts`
## For future Claude
> Universal Vector Search Cache System
cluster:: [[Clusters/cluster-94]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 496
## Summary

Universal Vector Search Cache System

## Imports

- imports:: [[Files/redis-service]] `./redis-service.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```