---
type: "file"
path: "src/routes/api/health/status/+server.ts"
aliases: ["+server.ts","src/routes/api/health/status/+server.ts"]
clusterId: 25
ext: ".ts"
lineCount: 41
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/health/status/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-25]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/25","route","t/ts","t/src","t/routes"]
---

# `src/routes/api/health/status/+server.ts`
## For future Claude
> GET /api/health/status — Service connection status check
cluster:: [[Clusters/cluster-25]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 41
## Summary

GET /api/health/status — Service connection status check

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```