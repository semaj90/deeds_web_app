---
type: "file"
path: "src/routes/api/codebase-index/cluster-detect/+server.ts"
aliases: ["+server.ts","src/routes/api/codebase-index/cluster-detect/+server.ts"]
clusterId: 69
ext: ".ts"
lineCount: 124
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/codebase-index/cluster-detect/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-69]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/69","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/codebase-index/cluster-detect/+server.ts`
## For future Claude
> POST /api/codebase-index/cluster-detect
cluster:: [[Clusters/cluster-69]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 124
## Summary

POST /api/codebase-index/cluster-detect

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```