---
type: "file"
path: "src/lib/server/db/verify-canvas-table.ts"
aliases: ["verify-canvas-table.ts","src/lib/server/db/verify-canvas-table.ts"]
clusterId: 6
ext: ".ts"
lineCount: 52
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/verify-canvas-table.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/client]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/verify-canvas-table.ts`
## For future Claude
> Verify that canvas_states table exists in the database.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 52
## Summary

Verify that canvas_states table exists in the database.

## Imports

- imports:: [[Files/client]] `./client.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```