---
type: "file"
path: "src/routes/api/routes/[routeId]/health-event/+server.ts"
aliases: ["+server.ts","src/routes/api/routes/[routeId]/health-event/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 126
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/routes/[routeId]/health-event/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/.]]","[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/routes/[routeId]/health-event/+server.ts`
## For future Claude
> Route Health Event API
pagerank:: 0.000000
blend:: 0.000000
lines:: 126
## Summary

Route Health Event API

## Imports

- imports:: [[Files/.]] `../../events/+server.js`
- imports:: [[Files/_types]] `./$types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```