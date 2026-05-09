---
type: "file"
path: "src/workers/ingestion-worker.ts"
aliases: ["ingestion-worker.ts","src/workers/ingestion-worker.ts"]
clusterId: -1
ext: ".ts"
lineCount: 28
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/workers/ingestion-worker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/workers"]
---

# `src/workers/ingestion-worker.ts`
## For future Claude
> .ts at src/workers/ingestion-worker.ts (28 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 28
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```