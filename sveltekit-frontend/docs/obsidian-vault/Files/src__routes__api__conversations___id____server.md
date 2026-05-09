---
type: "file"
path: "src/routes/api/conversations/[id]/+server.ts"
aliases: ["+server.ts","src/routes/api/conversations/[id]/+server.ts"]
clusterId: 27
ext: ".ts"
lineCount: 141
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/conversations/[id]/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-27]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/27","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/conversations/[id]/+server.ts`
## For future Claude
> PUT /api/conversations/[id] — Update conversation (save messages / rename)
cluster:: [[Clusters/cluster-27]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 141
## Summary

PUT /api/conversations/[id] — Update conversation (save messages / rename)

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```