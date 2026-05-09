---
type: "file"
path: "src/lib/server/ff1/cli/ff1-audit.ts"
aliases: ["ff1-audit.ts","src/lib/server/ff1/cli/ff1-audit.ts"]
clusterId: 6
ext: ".ts"
lineCount: 191
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ff1/cli/ff1-audit.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/audit__diagnostic-collector]]","[[Files/graph__graph-schema]]","[[Files/storage__redis-cache]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/ff1/cli/ff1-audit.ts`
## For future Claude
> ff1-audit.ts  —  FF1 Deep Audit CLI
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 191
## Summary

ff1-audit.ts  —  FF1 Deep Audit CLI

## Imports

- imports:: [[Files/audit__diagnostic-collector]] `../audit/diagnostic-collector.js`
- imports:: [[Files/graph__graph-schema]] `../graph/graph-schema.js`
- imports:: [[Files/storage__redis-cache]] `../storage/redis-cache.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```