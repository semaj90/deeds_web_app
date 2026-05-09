---
type: "file"
path: "src/routes/api/v1/ai/generate-layout/+server.ts"
aliases: ["+server.ts","src/routes/api/v1/ai/generate-layout/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 74
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/v1/ai/generate-layout/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/v1/ai/generate-layout/+server.ts`
## For future Claude
> POST /api/v1/ai/generate-layout — Generate smart node positions for evidence canvas
pagerank:: 0.000000
blend:: 0.000000
lines:: 74
## Summary

POST /api/v1/ai/generate-layout — Generate smart node positions for evidence canvas

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```