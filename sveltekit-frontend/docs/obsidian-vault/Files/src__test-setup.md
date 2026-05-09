---
type: "file"
path: "src/test-setup.ts"
aliases: ["test-setup.ts","src/test-setup.ts"]
clusterId: -1
ext: ".ts"
lineCount: 2
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/test-setup.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/test-setup_ts"]
---

# `src/test-setup.ts`
## For future Claude
> .ts at src/test-setup.ts (2 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 2
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```