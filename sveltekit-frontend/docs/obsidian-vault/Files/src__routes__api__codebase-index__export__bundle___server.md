---
type: "file"
path: "src/routes/api/codebase-index/export/bundle/+server.ts"
aliases: ["+server.ts","src/routes/api/codebase-index/export/bundle/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 430
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/codebase-index/export/bundle/+server.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/codebase-index/export/bundle/+server.ts`
## For future Claude
> GET /api/codebase-index/export/bundle
pagerank:: 0.000000
blend:: 0.000000
lines:: 430
## Summary

GET /api/codebase-index/export/bundle

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```