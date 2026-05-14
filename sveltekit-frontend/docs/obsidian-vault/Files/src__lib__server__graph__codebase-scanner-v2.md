---
type: "file"
path: "src/lib/server/graph/codebase-scanner-v2.ts"
aliases: ["codebase-scanner-v2.ts","src/lib/server/graph/codebase-scanner-v2.ts"]
clusterId: -1
ext: ".ts"
lineCount: 499
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/graph/codebase-scanner-v2.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","auth","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/codebase-scanner-v2.ts`
## For future Claude
> Codebase Scanner V2 — ts-morph primary + regex fallback + 20-step audit.
pagerank:: 0.000000
blend:: 0.000000
lines:: 499
## Summary

Codebase Scanner V2 — ts-morph primary + regex fallback + 20-step audit.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```