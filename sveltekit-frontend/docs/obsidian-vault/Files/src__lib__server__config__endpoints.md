---
type: "file"
path: "src/lib/server/config/endpoints.ts"
aliases: ["endpoints.ts","src/lib/server/config/endpoints.ts"]
clusterId: 75
ext: ".ts"
lineCount: 26
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/config/endpoints.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-75]]"]
imports: []
tags: ["file","ext/ts","cluster/75","t/ts","t/src","t/lib"]
---

# `src/lib/server/config/endpoints.ts`
## For future Claude
> Centralized utility functions for retrieving service endpoints.
cluster:: [[Clusters/cluster-75]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 26
## Summary

Centralized utility functions for retrieving service endpoints.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```