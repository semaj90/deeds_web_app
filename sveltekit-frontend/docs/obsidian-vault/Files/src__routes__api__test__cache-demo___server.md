---
type: "file"
path: "src/routes/api/test/cache-demo/+server.ts"
aliases: ["+server.ts","src/routes/api/test/cache-demo/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 105
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: true
hasAuth: true
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/test/cache-demo/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","test","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/test/cache-demo/+server.ts`
## For future Claude
> POST /api/test/cache-demo
pagerank:: 0.000000
blend:: 0.000000
lines:: 105
## Summary

POST /api/test/cache-demo

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```