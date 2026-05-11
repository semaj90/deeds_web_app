---
type: "file"
path: "src/service-worker.ts"
aliases: ["service-worker.ts","src/service-worker.ts"]
clusterId: -1
ext: ".ts"
lineCount: 594
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/service-worker.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/service-worker_ts"]
---

# `src/service-worker.ts`
## For future Claude
> Handle background sync for cache warming and data sync
pagerank:: 0.000000
blend:: 0.000000
lines:: 594
## Summary

Handle background sync for cache warming and data sync

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```