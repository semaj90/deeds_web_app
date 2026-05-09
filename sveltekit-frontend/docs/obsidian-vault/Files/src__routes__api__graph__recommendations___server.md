---
type: "file"
path: "src/routes/api/graph/recommendations/+server.ts"
aliases: ["+server.ts","src/routes/api/graph/recommendations/+server.ts"]
clusterId: 72
ext: ".ts"
lineCount: 147
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/graph/recommendations/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-72]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/72","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/graph/recommendations/+server.ts`
## For future Claude
> POST /api/graph/recommendations
cluster:: [[Clusters/cluster-72]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 147
## Summary

POST /api/graph/recommendations

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```