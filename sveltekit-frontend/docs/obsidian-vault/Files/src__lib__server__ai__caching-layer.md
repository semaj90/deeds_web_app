---
type: "file"
path: "src/lib/server/ai/caching-layer.ts"
aliases: ["caching-layer.ts","src/lib/server/ai/caching-layer.ts"]
clusterId: 19
ext: ".ts"
lineCount: 395
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/caching-layer.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: []
tags: ["file","ext/ts","cluster/19","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/caching-layer.ts`
## For future Claude
> CachingLayer — 3-tier cache: Hot (in-memory) → LRU → Redis
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 395
## Summary

CachingLayer — 3-tier cache: Hot (in-memory) → LRU → Redis

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```