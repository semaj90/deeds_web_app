---
type: "file"
path: "src/routes/(app)/cases/+page.server.ts"
aliases: ["+page.server.ts","src/routes/(app)/cases/+page.server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 249
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 10
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/cases/+page.server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]","[[Files/schema]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/(app)/cases/+page.server.ts`
## For future Claude
> SSR Load Function - Server-side data fetching for cases
pagerank:: 0.000000
blend:: 0.000000
lines:: 249
## Summary

SSR Load Function - Server-side data fetching for cases

## Imports

- imports:: [[Files/_types]] `./$types`
- imports:: [[Files/schema]] `./schema.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```