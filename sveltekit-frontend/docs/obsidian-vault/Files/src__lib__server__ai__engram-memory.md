---
type: "file"
path: "src/lib/server/ai/engram-memory.ts"
aliases: ["engram-memory.ts","src/lib/server/ai/engram-memory.ts"]
clusterId: 19
ext: ".ts"
lineCount: 123
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/engram-memory.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: []
tags: ["file","ext/ts","cluster/19","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/engram-memory.ts`
## For future Claude
> Engram Memory — Redis-backed bigram transition store for ACE retrieval.
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 123
## Summary

Engram Memory — Redis-backed bigram transition store for ACE retrieval.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```