---
type: "file"
path: "src/routes/api/dashboard/stats/+server.ts"
aliases: ["+server.ts","src/routes/api/dashboard/stats/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 111
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/dashboard/stats/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","t/ts","t/src","t/routes"]
---

# `src/routes/api/dashboard/stats/+server.ts`
## For future Claude
> GET /api/dashboard/stats
pagerank:: 0.000000
blend:: 0.000000
lines:: 111
## Summary

GET /api/dashboard/stats

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```