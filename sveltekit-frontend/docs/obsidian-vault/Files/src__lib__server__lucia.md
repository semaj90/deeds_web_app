---
type: "file"
path: "src/lib/server/lucia.ts"
aliases: ["lucia.ts","src/lib/server/lucia.ts"]
clusterId: 90
ext: ".ts"
lineCount: 151
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/lucia.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-90]]"]
imports: []
tags: ["file","ext/ts","cluster/90","t/ts","t/src","t/lib"]
---

# `src/lib/server/lucia.ts`
## For future Claude
> Creates a user session using Lucia.
cluster:: [[Clusters/cluster-90]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 151
## Summary

Creates a user session using Lucia.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```