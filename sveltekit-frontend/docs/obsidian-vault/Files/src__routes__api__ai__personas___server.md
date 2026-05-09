---
type: "file"
path: "src/routes/api/ai/personas/+server.ts"
aliases: ["+server.ts","src/routes/api/ai/personas/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 23
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/ai/personas/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","t/ts","t/src","t/routes"]
---

# `src/routes/api/ai/personas/+server.ts`
## For future Claude
> GET /api/ai/personas
pagerank:: 0.000000
blend:: 0.000000
lines:: 23
## Summary

GET /api/ai/personas

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```