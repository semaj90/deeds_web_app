---
type: "file"
path: "src/lib/server/middleware/rate-limiter.ts"
aliases: ["rate-limiter.ts","src/lib/server/middleware/rate-limiter.ts"]
clusterId: 6
ext: ".ts"
lineCount: 230
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/middleware/rate-limiter.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/middleware/rate-limiter.ts`
## For future Claude
> Redis-backed sliding window rate limiter.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 230
## Summary

Redis-backed sliding window rate limiter.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```