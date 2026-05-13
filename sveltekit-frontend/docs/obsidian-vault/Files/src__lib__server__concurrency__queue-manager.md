---
type: "file"
path: "src/lib/server/concurrency/queue-manager.ts"
aliases: ["queue-manager.ts","src/lib/server/concurrency/queue-manager.ts"]
clusterId: -1
ext: ".ts"
lineCount: 424
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/concurrency/queue-manager.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/transaction-manager]]","[[Files/advisory-locks]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/concurrency/queue-manager.ts`
## For future Claude
> Concurrent Operation Queue Manager for Legal AI Platform
pagerank:: 0.000000
blend:: 0.000000
lines:: 424
## Summary

Concurrent Operation Queue Manager for Legal AI Platform

## Imports

- imports:: [[Files/transaction-manager]] `./transaction-manager.js`
- imports:: [[Files/advisory-locks]] `./advisory-locks.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```