---
type: "file"
path: "src/lib/server/middleware/validate-and-rate.ts"
aliases: ["validate-and-rate.ts","src/lib/server/middleware/validate-and-rate.ts"]
clusterId: 6
ext: ".ts"
lineCount: 97
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/middleware/validate-and-rate.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/middleware/validate-and-rate.ts`
## For future Claude
> Wrap a SvelteKit RequestHandler with Zod validation and a Redis-backed token-bucket rate limiter.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 97
## Summary

Wrap a SvelteKit RequestHandler with Zod validation and a Redis-backed token-bucket rate limiter.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```