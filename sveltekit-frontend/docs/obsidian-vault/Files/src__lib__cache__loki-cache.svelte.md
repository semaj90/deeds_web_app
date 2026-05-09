---
type: "file"
path: "src/lib/cache/loki-cache.svelte.ts"
aliases: ["loki-cache.svelte.ts","src/lib/cache/loki-cache.svelte.ts"]
clusterId: 94
ext: ".ts"
lineCount: 356
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/cache/loki-cache.svelte.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-94]]"]
imports: []
tags: ["file","ext/ts","cluster/94","zod","t/ts","t/src","t/lib"]
---

# `src/lib/cache/loki-cache.svelte.ts`
## For future Claude
> LokiJS In-Memory Reactive Cache
cluster:: [[Clusters/cluster-94]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 356
## Summary

LokiJS In-Memory Reactive Cache

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```