---
type: "file"
path: "src/routes/api/health/capabilities/+server.ts"
aliases: ["+server.ts","src/routes/api/health/capabilities/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 228
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/health/capabilities/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","t/ts","t/src","t/routes"]
---

# `src/routes/api/health/capabilities/+server.ts`
## For future Claude
> GET /api/health/capabilities
pagerank:: 0.000000
blend:: 0.000000
lines:: 228
## Summary

GET /api/health/capabilities

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```