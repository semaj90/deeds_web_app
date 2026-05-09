---
type: "file"
path: "src/routes/api/auth/session/+server.ts"
aliases: ["+server.ts","src/routes/api/auth/session/+server.ts"]
clusterId: 90
ext: ".ts"
lineCount: 74
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/auth/session/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-90]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/90","route","t/ts","t/src","t/routes"]
---

# `src/routes/api/auth/session/+server.ts`
## For future Claude
> Session API - Lucia v3
cluster:: [[Clusters/cluster-90]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 74
## Summary

Session API - Lucia v3

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```