---
type: "file"
path: "src/lib/server/db/drizzle.ts"
aliases: ["drizzle.ts","src/lib/server/db/drizzle.ts"]
clusterId: 6
ext: ".ts"
lineCount: 172
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/drizzle.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/client]]","[[Files/schema]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/drizzle.ts`
## For future Claude
> Unified Drizzle + Vector + Storage utilities
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 172
## Summary

Unified Drizzle + Vector + Storage utilities

## Imports

- imports:: [[Files/client]] `./client.js`
- imports:: [[Files/schema]] `./schema.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```