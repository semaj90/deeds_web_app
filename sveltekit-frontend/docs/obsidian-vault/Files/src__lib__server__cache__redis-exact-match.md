---
type: "file"
path: "src/lib/server/cache/redis-exact-match.ts"
aliases: ["redis-exact-match.ts","src/lib/server/cache/redis-exact-match.ts"]
clusterId: 22
ext: ".ts"
lineCount: 300
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/cache/redis-exact-match.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-22]]"]
imports: ["[[Files/redis]]","[[Files/cache-keys]]"]
tags: ["file","ext/ts","cluster/22","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/cache/redis-exact-match.ts`
## For future Claude
> Redis Exact-Match Cache Layer (L1)
cluster:: [[Clusters/cluster-22]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 300
## Summary

Redis Exact-Match Cache Layer (L1)

## Imports

- imports:: [[Files/redis]] `../redis.js`
- imports:: [[Files/cache-keys]] `../cache-keys.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```