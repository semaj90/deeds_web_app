---
type: "file"
path: "src/routes/api/wiki/moc/+server.ts"
aliases: ["+server.ts","src/routes/api/wiki/moc/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 162
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/wiki/moc/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/wiki/moc/+server.ts`
## For future Claude
> POST /api/wiki/moc — Generate + push the Map of Content index file.
pagerank:: 0.000000
blend:: 0.000000
lines:: 162
## Summary

POST /api/wiki/moc — Generate + push the Map of Content index file.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```