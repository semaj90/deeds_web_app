---
type: "file"
path: "src/lib/types/index.ts"
aliases: ["index.ts","src/lib/types/index.ts"]
clusterId: 0
ext: ".ts"
lineCount: 153
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/types/index.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-0]]"]
imports: []
tags: ["file","ext/ts","cluster/0","zod","t/ts","t/src","t/lib"]
---

# `src/lib/types/index.ts`
## For future Claude
> Central type export hub for all API response types
cluster:: [[Clusters/cluster-0]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 153
## Summary

Central type export hub for all API response types

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```