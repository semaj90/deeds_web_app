---
type: "file"
path: "src/routes/api/persons-of-interest/[id]/face-match/+server.ts"
aliases: ["+server.ts","src/routes/api/persons-of-interest/[id]/face-match/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 390
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/persons-of-interest/[id]/face-match/+server.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/persons-of-interest/[id]/face-match/+server.ts`
## For future Claude
> POST /api/persons-of-interest/[id]/face-match
pagerank:: 0.000000
blend:: 0.000000
lines:: 390
## Summary

POST /api/persons-of-interest/[id]/face-match

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```