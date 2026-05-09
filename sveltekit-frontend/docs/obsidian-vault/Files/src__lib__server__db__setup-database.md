---
type: "file"
path: "src/lib/server/db/setup-database.ts"
aliases: ["setup-database.ts","src/lib/server/db/setup-database.ts"]
clusterId: 6
ext: ".ts"
lineCount: 77
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/setup-database.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/unified-client]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/setup-database.ts`
## For future Claude
> Database Setup Script for Unified Vector Systems
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 77
## Summary

Database Setup Script for Unified Vector Systems

## Imports

- imports:: [[Files/unified-client]] `./unified-client.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```