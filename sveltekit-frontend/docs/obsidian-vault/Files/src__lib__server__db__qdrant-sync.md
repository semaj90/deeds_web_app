---
type: "file"
path: "src/lib/server/db/qdrant-sync.ts"
aliases: ["qdrant-sync.ts","src/lib/server/db/qdrant-sync.ts"]
clusterId: 6
ext: ".ts"
lineCount: 408
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/qdrant-sync.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/client]]","[[Files/postgres-knowledge]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/qdrant-sync.ts`
## For future Claude
> Qdrant Mirror Sync Pipeline
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 408
## Summary

Qdrant Mirror Sync Pipeline

## Imports

- imports:: [[Files/client]] `./client.js`
- imports:: [[Files/postgres-knowledge]] `./postgres-knowledge.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```