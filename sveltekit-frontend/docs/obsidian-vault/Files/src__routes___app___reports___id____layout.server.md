---
type: "file"
path: "src/routes/(app)/reports/[id]/+layout.server.ts"
aliases: ["+layout.server.ts","src/routes/(app)/reports/[id]/+layout.server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 26
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/reports/[id]/+layout.server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","auth","t/ts","t/src","t/routes"]
---

# `src/routes/(app)/reports/[id]/+layout.server.ts`
## For future Claude
> .ts at src/routes/(app)/reports/[id]/+layout.server.ts (26 lines), auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 26
## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```