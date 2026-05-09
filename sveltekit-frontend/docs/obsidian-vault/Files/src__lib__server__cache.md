---
type: "file"
path: "src/lib/server/cache.ts"
aliases: ["cache.ts","src/lib/server/cache.ts"]
clusterId: 94
ext: ".ts"
lineCount: 264
pagerank: 0.218228
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/cache.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-94]]"]
imports: []
tags: ["file","ext/ts","cluster/94","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/cache.ts`
## For future Claude
> Instrumented Redis GET — records hit/miss + latency in cacheMetrics.
cluster:: [[Clusters/cluster-94]]
pagerank:: 0.218228
blend:: 0.000000
lines:: 264
## Summary

Instrumented Redis GET — records hit/miss + latency in cacheMetrics.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```