---
type: "file"
path: "src/workers/embedding-worker.ts"
aliases: ["embedding-worker.ts","src/workers/embedding-worker.ts"]
clusterId: -1
ext: ".ts"
lineCount: 187
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/workers/embedding-worker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/workers"]
---

# `src/workers/embedding-worker.ts`
## For future Claude
> Embedding Worker — standalone async consumer for the `document.embed` queue.
pagerank:: 0.000000
blend:: 0.000000
lines:: 187
## Summary

Embedding Worker — standalone async consumer for the `document.embed` queue.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```