---
type: "file"
path: "src/routes/api/ai/tensorrt/vlm/+server.ts"
aliases: ["+server.ts","src/routes/api/ai/tensorrt/vlm/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 291
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/ai/tensorrt/vlm/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/ai/tensorrt/vlm/+server.ts`
## For future Claude
> POST /api/ai/tensorrt/vlm
pagerank:: 0.000000
blend:: 0.000000
lines:: 291
## Summary

POST /api/ai/tensorrt/vlm

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```