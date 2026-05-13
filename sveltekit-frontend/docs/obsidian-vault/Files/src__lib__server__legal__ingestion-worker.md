---
type: "file"
path: "src/lib/server/legal/ingestion-worker.ts"
aliases: ["ingestion-worker.ts","src/lib/server/legal/ingestion-worker.ts"]
clusterId: -1
ext: ".ts"
lineCount: 627
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/legal/ingestion-worker.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/legal/ingestion-worker.ts`
## For future Claude
> Legal Library Ingestion Worker
pagerank:: 0.000000
blend:: 0.000000
lines:: 627
## Summary

Legal Library Ingestion Worker

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```