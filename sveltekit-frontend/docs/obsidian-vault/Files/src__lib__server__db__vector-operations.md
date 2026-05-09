---
type: "file"
path: "src/lib/server/db/vector-operations.ts"
aliases: ["vector-operations.ts","src/lib/server/db/vector-operations.ts"]
clusterId: 6
ext: ".ts"
lineCount: 289
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/vector-operations.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/client]]","[[Files/schema-postgres]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/vector-operations.ts`
## For future Claude
> Vector Operations for PostgreSQL pgvector
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 289
## Summary

Vector Operations for PostgreSQL pgvector

## Imports

- imports:: [[Files/client]] `./client.js`
- imports:: [[Files/schema-postgres]] `./schema-postgres.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```