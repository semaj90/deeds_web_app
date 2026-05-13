---
type: "file"
path: "src/lib/server/graph/graph-remote-functions.ts"
aliases: ["graph-remote-functions.ts","src/lib/server/graph/graph-remote-functions.ts"]
clusterId: -1
ext: ".ts"
lineCount: 465
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/graph/graph-remote-functions.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/graph-remote-functions.ts`
## For future Claude
> Graph Remote Functions — small UI reads for the Graphify viewer
pagerank:: 0.000000
blend:: 0.000000
lines:: 465
## Summary

Graph Remote Functions — small UI reads for the Graphify viewer

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```