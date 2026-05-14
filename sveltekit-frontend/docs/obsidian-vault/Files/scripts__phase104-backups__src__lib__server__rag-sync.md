---
type: "file"
path: "scripts/phase104-backups/src/lib/server/rag-sync.ts"
aliases: ["rag-sync.ts","scripts/phase104-backups/src/lib/server/rag-sync.ts"]
clusterId: -1
ext: ".ts"
lineCount: 619
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/scripts/phase104-backups/src/lib/server/rag-sync.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/db]]","[[Files/embedding-service]]","[[Files/rag__qdrant]]","[[Files/rag__tag-extractor]]","[[Files/rag__tag-persist]]","[[Files/rag__cache]]"]
tags: ["file","ext/ts","t/ts","t/scripts","t/phase104-backups"]
---

# `scripts/phase104-backups/src/lib/server/rag-sync.ts`
## For future Claude
> RAG Index Sync Service - Task 2.5
pagerank:: 0.000000
blend:: 0.000000
lines:: 619
## Summary

RAG Index Sync Service - Task 2.5

## Imports

- imports:: [[Files/db]] `./db.js`
- imports:: [[Files/embedding-service]] `./embedding-service.js`
- imports:: [[Files/rag__qdrant]] `./rag/qdrant.js`
- imports:: [[Files/rag__tag-extractor]] `./rag/tag-extractor.js`
- imports:: [[Files/rag__tag-persist]] `./rag/tag-persist.js`
- imports:: [[Files/rag__cache]] `./rag/cache.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```