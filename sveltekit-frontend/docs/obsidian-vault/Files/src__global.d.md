---
type: "file"
path: "src/global.d.ts"
aliases: ["global.d.ts","src/global.d.ts"]
clusterId: -1
ext: ".ts"
lineCount: 124
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/global.d.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/global_d_ts"]
---

# `src/global.d.ts`
## For future Claude
> .ts at src/global.d.ts (124 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 124
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```