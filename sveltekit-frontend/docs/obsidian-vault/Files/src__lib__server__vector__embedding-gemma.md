---
type: "file"
path: "src/lib/server/vector/embedding-gemma.ts"
aliases: ["embedding-gemma.ts","src/lib/server/vector/embedding-gemma.ts"]
clusterId: 18
ext: ".ts"
lineCount: 192
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/vector/embedding-gemma.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-18]]"]
imports: []
tags: ["file","ext/ts","cluster/18","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/vector/embedding-gemma.ts`
## For future Claude
> Streaming Embedding Service — AsyncGenerator-based embedding with progress events
cluster:: [[Clusters/cluster-18]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 192
## Summary

Streaming Embedding Service — AsyncGenerator-based embedding with progress events

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```