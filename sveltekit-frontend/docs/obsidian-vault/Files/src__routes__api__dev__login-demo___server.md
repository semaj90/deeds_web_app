---
type: "file"
path: "src/routes/api/dev/login-demo/+server.ts"
aliases: ["+server.ts","src/routes/api/dev/login-demo/+server.ts"]
clusterId: 90
ext: ".ts"
lineCount: 63
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/dev/login-demo/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-90]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/90","route","auth","t/ts","t/src","t/routes"]
---

# `src/routes/api/dev/login-demo/+server.ts`
## For future Claude
> DEV-ONLY Login Endpoint
cluster:: [[Clusters/cluster-90]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 63
## Summary

DEV-ONLY Login Endpoint

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```