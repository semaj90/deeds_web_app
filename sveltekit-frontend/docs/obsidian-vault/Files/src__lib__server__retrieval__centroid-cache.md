---
type: "file"
path: "src/lib/server/retrieval/centroid-cache.ts"
aliases: ["centroid-cache.ts","src/lib/server/retrieval/centroid-cache.ts"]
clusterId: 58
ext: ".ts"
lineCount: 540
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/centroid-cache.ts"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: []
tags: ["file","ext/ts","cluster/58","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/centroid-cache.ts`
## For future Claude
> Centroid cache — precomputed cluster centroid vectors in Redis.
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 540
## Summary

Centroid cache — precomputed cluster centroid vectors in Redis.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```