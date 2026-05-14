---
type: "file"
path: "src/lib/server/inference/inference-router.ts"
aliases: ["inference-router.ts","src/lib/server/inference/inference-router.ts"]
clusterId: -1
ext: ".ts"
lineCount: 1296
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 14
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/inference/inference-router.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/gpu-arbiter]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/inference/inference-router.ts`
## For future Claude
> Server-Side Inference Router
pagerank:: 0.000000
blend:: 0.000000
lines:: 1296
## Summary

Server-Side Inference Router

## Imports

- imports:: [[Files/gpu-arbiter]] `./gpu-arbiter.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```