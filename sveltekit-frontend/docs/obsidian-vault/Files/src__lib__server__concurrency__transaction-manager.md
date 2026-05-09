---
type: "file"
path: "src/lib/server/concurrency/transaction-manager.ts"
aliases: ["transaction-manager.ts","src/lib/server/concurrency/transaction-manager.ts"]
clusterId: 61
ext: ".ts"
lineCount: 240
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/concurrency/transaction-manager.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-61]]"]
imports: ["[[Files/advisory-locks]]"]
tags: ["file","ext/ts","cluster/61","t/ts","t/src","t/lib"]
---

# `src/lib/server/concurrency/transaction-manager.ts`
## For future Claude
> Transaction Manager with Advisory Locks for Legal AI Platform
cluster:: [[Clusters/cluster-61]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 240
## Summary

Transaction Manager with Advisory Locks for Legal AI Platform

## Imports

- imports:: [[Files/advisory-locks]] `./advisory-locks.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```