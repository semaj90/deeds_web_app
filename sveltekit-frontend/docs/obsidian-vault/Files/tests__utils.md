---
type: "file"
path: "tests/utils.ts"
aliases: ["utils.ts","tests/utils.ts"]
clusterId: -1
ext: ".ts"
lineCount: 11
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/tests/utils.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/utils_ts"]
---

# `tests/utils.ts`
## For future Claude
> .ts at tests/utils.ts (11 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 11
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```