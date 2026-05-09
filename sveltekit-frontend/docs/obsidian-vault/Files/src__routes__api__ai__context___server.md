---
type: "file"
path: "src/routes/api/ai/context/+server.ts"
aliases: ["+server.ts","src/routes/api/ai/context/+server.ts"]
clusterId: 26
ext: ".ts"
lineCount: 112
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/ai/context/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-26]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/26","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/ai/context/+server.ts`
## For future Claude
> POST /api/ai/context — Retrieve relevant documents and citations for a query
cluster:: [[Clusters/cluster-26]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 112
## Summary

POST /api/ai/context — Retrieve relevant documents and citations for a query

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```