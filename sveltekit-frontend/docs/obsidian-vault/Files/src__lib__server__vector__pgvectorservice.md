---
type: "file"
path: "src/lib/server/vector/PgVectorService.ts"
aliases: ["PgVectorService.ts","src/lib/server/vector/PgVectorService.ts"]
clusterId: 18
ext: ".ts"
lineCount: 225
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/vector/PgVectorService.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-18]]"]
imports: []
tags: ["file","ext/ts","cluster/18","t/ts","t/src","t/lib"]
---

# `src/lib/server/vector/PgVectorService.ts`
## For future Claude
> PgVectorService — Full pgvector search + storage service
cluster:: [[Clusters/cluster-18]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 225
## Summary

PgVectorService — Full pgvector search + storage service

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```