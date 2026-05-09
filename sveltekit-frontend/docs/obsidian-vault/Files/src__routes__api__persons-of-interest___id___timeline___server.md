---
type: "file"
path: "src/routes/api/persons-of-interest/[id]/timeline/+server.ts"
aliases: ["+server.ts","src/routes/api/persons-of-interest/[id]/timeline/+server.ts"]
clusterId: 13
ext: ".ts"
lineCount: 127
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/persons-of-interest/[id]/timeline/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-13]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/13","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/persons-of-interest/[id]/timeline/+server.ts`
## For future Claude
> GET /api/persons-of-interest/[id]/timeline
cluster:: [[Clusters/cluster-13]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 127
## Summary

GET /api/persons-of-interest/[id]/timeline

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```