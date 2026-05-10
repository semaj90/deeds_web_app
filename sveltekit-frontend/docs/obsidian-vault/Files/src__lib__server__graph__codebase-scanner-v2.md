---
type: "file"
path: "src/lib/server/graph/codebase-scanner-v2.ts"
aliases: ["codebase-scanner-v2.ts","src/lib/server/graph/codebase-scanner-v2.ts"]
clusterId: 73
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
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: []
tags: ["file","ext/ts","cluster/73","auth","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/codebase-scanner-v2.ts`
## For future Claude
> Codebase Scanner V2 — ts-morph primary + regex fallback + 20-step audit.
cluster:: [[Clusters/cluster-73]]
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