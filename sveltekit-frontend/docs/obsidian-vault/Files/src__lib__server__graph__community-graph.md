---
type: "file"
path: "src/lib/server/graph/community-graph.ts"
aliases: ["community-graph.ts","src/lib/server/graph/community-graph.ts"]
clusterId: -1
ext: ".ts"
lineCount: 897
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/graph/community-graph.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/community-graph.ts`
## For future Claude
> community-graph.ts — GraphRAG-style community detection over the codebase graph.
pagerank:: 0.000000
blend:: 0.000000
lines:: 897
## Summary

community-graph.ts — GraphRAG-style community detection over the codebase graph.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```