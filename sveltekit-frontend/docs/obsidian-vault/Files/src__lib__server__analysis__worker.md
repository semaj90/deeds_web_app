---
type: "file"
path: "src/lib/server/analysis/worker.ts"
aliases: ["worker.ts","src/lib/server/analysis/worker.ts"]
clusterId: 32
ext: ".ts"
lineCount: 161
pagerank: 0.21867
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analysis/worker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: ["[[Files/analysis-jobs]]","[[Files/concurrency-gate]]"]
tags: ["file","ext/ts","cluster/32","t/ts","t/src","t/lib"]
---

# `src/lib/server/analysis/worker.ts`
## For future Claude
> DB-backed analysis worker loop.
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.218670
blend:: 0.000000
lines:: 161
## Summary

DB-backed analysis worker loop.

## Imports

- imports:: [[Files/analysis-jobs]] `./analysis-jobs.js`
- imports:: [[Files/concurrency-gate]] `./concurrency-gate.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```