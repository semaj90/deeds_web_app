---
type: "file"
path: "src/lib/server/vector/multi-store.ts"
aliases: ["multi-store.ts","src/lib/server/vector/multi-store.ts"]
clusterId: 57
ext: ".ts"
lineCount: 262
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/vector/multi-store.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: ["[[Files/pgvectorservice]]"]
tags: ["file","ext/ts","cluster/57","t/ts","t/src","t/lib"]
---

# `src/lib/server/vector/multi-store.ts`
## For future Claude
> MultiVectorStore — Dual-write coordinator for Qdrant + pgvector
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 262
## Summary

MultiVectorStore — Dual-write coordinator for Qdrant + pgvector

## Imports

- imports:: [[Files/pgvectorservice]] `./PgVectorService.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```