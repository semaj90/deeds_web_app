---
type: "file"
path: "src/routes/api/code-intel/graph/impact/+server.ts"
aliases: ["+server.ts","src/routes/api/code-intel/graph/impact/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 52
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/code-intel/graph/impact/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","route","auth","t/ts","t/src","t/routes"]
---

# `src/routes/api/code-intel/graph/impact/+server.ts`
## For future Claude
> GET /api/code-intel/graph/impact?stableKey=<key>&depth=3&limit=250&categorize=true
pagerank:: 0.000000
blend:: 0.000000
lines:: 52
## Summary

GET /api/code-intel/graph/impact?stableKey=<key>&depth=3&limit=250&categorize=true

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```