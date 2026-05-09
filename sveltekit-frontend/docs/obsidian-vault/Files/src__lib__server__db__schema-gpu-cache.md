---
type: "file"
path: "src/lib/server/db/schema-gpu-cache.ts"
aliases: ["schema-gpu-cache.ts","src/lib/server/db/schema-gpu-cache.ts"]
clusterId: 10
ext: ".ts"
lineCount: 206
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema-gpu-cache.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-10]]"]
imports: []
tags: ["file","ext/ts","cluster/10","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema-gpu-cache.ts`
## For future Claude
> Primary shader cache entries with source code, compiled binaries, and metadata
cluster:: [[Clusters/cluster-10]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 206
## Summary

Primary shader cache entries with source code, compiled binaries, and metadata

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```