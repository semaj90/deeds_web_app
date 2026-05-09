---
type: "file"
path: "src/lib/server/embedding-cache.ts"
aliases: ["embedding-cache.ts","src/lib/server/embedding-cache.ts"]
clusterId: 6
ext: ".ts"
lineCount: 111
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/embedding-cache.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/redis]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/embedding-cache.ts`
## For future Claude
> Binary embedding cache for Redis
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 111
## Summary

Binary embedding cache for Redis

## Imports

- imports:: [[Files/redis]] `./redis.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```