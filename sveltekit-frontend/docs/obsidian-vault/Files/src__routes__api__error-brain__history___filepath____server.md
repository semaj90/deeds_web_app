---
type: "file"
path: "src/routes/api/error-brain/history/[filePath]/+server.ts"
aliases: ["+server.ts","src/routes/api/error-brain/history/[filePath]/+server.ts"]
clusterId: 64
ext: ".ts"
lineCount: 48
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/error-brain/history/[filePath]/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-64]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/64","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/error-brain/history/[filePath]/+server.ts`
## For future Claude
> GET /api/error-brain/history/[filePath]
cluster:: [[Clusters/cluster-64]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 48
## Summary

GET /api/error-brain/history/[filePath]

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```