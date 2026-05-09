---
type: "file"
path: "src/routes/api/citations/[citationId]/tags/+server.ts"
aliases: ["+server.ts","src/routes/api/citations/[citationId]/tags/+server.ts"]
clusterId: 85
ext: ".ts"
lineCount: 121
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/citations/[citationId]/tags/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-85]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/85","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/citations/[citationId]/tags/+server.ts`
## For future Claude
> GET /api/citations/[citationId]/tags
cluster:: [[Clusters/cluster-85]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 121
## Summary

GET /api/citations/[citationId]/tags

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```