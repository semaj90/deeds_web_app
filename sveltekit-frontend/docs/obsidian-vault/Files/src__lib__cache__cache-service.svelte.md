---
type: "file"
path: "src/lib/cache/cache-service.svelte.ts"
aliases: ["cache-service.svelte.ts","src/lib/cache/cache-service.svelte.ts"]
clusterId: 94
ext: ".ts"
lineCount: 351
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/cache/cache-service.svelte.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-94]]"]
imports: ["[[Files/indexdb-cache]]","[[Files/loki-cache]]"]
tags: ["file","ext/ts","cluster/94","t/ts","t/src","t/lib"]
---

# `src/lib/cache/cache-service.svelte.ts`
## For future Claude
> Unified Cache Service - Two-Layer Architecture
cluster:: [[Clusters/cluster-94]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 351
## Summary

Unified Cache Service - Two-Layer Architecture

## Imports

- imports:: [[Files/indexdb-cache]] `./indexdb-cache.svelte`
- imports:: [[Files/loki-cache]] `./loki-cache.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```