---
type: "file"
path: "src/routes/(app)/admin/all-routes/+page.server.ts"
aliases: ["+page.server.ts","src/routes/(app)/admin/all-routes/+page.server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 300
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/admin/all-routes/+page.server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/(app)/admin/all-routes/+page.server.ts`
## For future Claude
> 6.1: Query database for route metadata directly
pagerank:: 0.000000
blend:: 0.000000
lines:: 300
## Summary

6.1: Query database for route metadata directly

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```