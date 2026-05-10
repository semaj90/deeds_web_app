---
type: "file"
path: "src/lib/server/db/pgvector-utils.ts"
aliases: ["pgvector-utils.ts","src/lib/server/db/pgvector-utils.ts"]
clusterId: 6
ext: ".ts"
lineCount: 400
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/pgvector-utils.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/client]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/pgvector-utils.ts`
## For future Claude
> PostgreSQL pgvector utilities for vector operations
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 400
## Summary

PostgreSQL pgvector utilities for vector operations

## Imports

- imports:: [[Files/client]] `./client`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```