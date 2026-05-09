---
type: "file"
path: "src/routes/api/graph/topology-neighbors/+server.ts"
aliases: ["+server.ts","src/routes/api/graph/topology-neighbors/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 191
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/graph/topology-neighbors/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","t/ts","t/src","t/routes"]
---

# `src/routes/api/graph/topology-neighbors/+server.ts`
## For future Claude
> GET /api/graph/topology-neighbors?nodeId=<file-path>&k=12&clusterId=<int>
pagerank:: 0.000000
blend:: 0.000000
lines:: 191
## Summary

GET /api/graph/topology-neighbors?nodeId=<file-path>&k=12&clusterId=<int>

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```