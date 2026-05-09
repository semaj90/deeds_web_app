---
type: "file"
path: "src/lib/server/auth-helpers.ts"
aliases: ["auth-helpers.ts","src/lib/server/auth-helpers.ts"]
clusterId: 6
ext: ".ts"
lineCount: 93
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/auth-helpers.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","auth","t/ts","t/src","t/lib"]
---

# `src/lib/server/auth-helpers.ts`
## For future Claude
> Authentication helpers that trust the user/session already resolved by hooks.server.ts.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 93
## Summary

Authentication helpers that trust the user/session already resolved by hooks.server.ts.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```