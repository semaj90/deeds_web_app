---
type: "file"
path: "src/routes/api/health/+server.ts"
aliases: ["+server.ts","src/routes/api/health/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 416
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/health/+server.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/health/+server.ts`
## For future Claude
> Unified Health Endpoint — aggregates all infrastructure status in a single call.
pagerank:: 0.000000
blend:: 0.000000
lines:: 416
## Summary

Unified Health Endpoint — aggregates all infrastructure status in a single call.

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```