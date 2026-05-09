---
type: "file"
path: "src/lib/server/db/connections.ts"
aliases: ["connections.ts","src/lib/server/db/connections.ts"]
clusterId: 15
ext: ".ts"
lineCount: 84
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/connections.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-15]]"]
imports: []
tags: ["file","ext/ts","cluster/15","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/connections.ts`
## For future Claude
> 🔒 Runtime App Connection (legal_admin - limited privileges)
cluster:: [[Clusters/cluster-15]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 84
## Summary

🔒 Runtime App Connection (legal_admin - limited privileges)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```