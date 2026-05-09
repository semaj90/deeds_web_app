---
type: "file"
path: "src/routes/api/statutes/search/+server.ts"
aliases: ["+server.ts","src/routes/api/statutes/search/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 183
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/statutes/search/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/statutes/search/+server.ts`
## For future Claude
> POST /api/statutes/search
pagerank:: 0.000000
blend:: 0.000000
lines:: 183
## Summary

POST /api/statutes/search

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```