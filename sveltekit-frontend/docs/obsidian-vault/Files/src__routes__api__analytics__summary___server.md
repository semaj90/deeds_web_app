---
type: "file"
path: "src/routes/api/analytics/summary/+server.ts"
aliases: ["+server.ts","src/routes/api/analytics/summary/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 30
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/analytics/summary/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/analytics/summary/+server.ts`
## For future Claude
> GET /api/analytics/summary — Weekly analytics summary for a user
pagerank:: 0.000000
blend:: 0.000000
lines:: 30
## Summary

GET /api/analytics/summary — Weekly analytics summary for a user

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```