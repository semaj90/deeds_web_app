---
type: "file"
path: "src/lib/phase72/routeGraphAdapter.ts"
aliases: ["routeGraphAdapter.ts","src/lib/phase72/routeGraphAdapter.ts"]
clusterId: 57
ext: ".ts"
lineCount: 148
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/phase72/routeGraphAdapter.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: []
tags: ["file","ext/ts","cluster/57","zod","t/ts","t/src","t/lib"]
---

# `src/lib/phase72/routeGraphAdapter.ts`
## For future Claude
> Route Graph Adapter — bridges phase72 route discovery with the codebase graph.
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 148
## Summary

Route Graph Adapter — bridges phase72 route discovery with the codebase graph.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```