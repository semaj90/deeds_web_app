---
type: "file"
path: "tests/navigation.test.ts"
aliases: ["navigation.test.ts","tests/navigation.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 36
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/navigation.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/navigation_test_ts"]
---

# `tests/navigation.test.ts`
## For future Claude
> .ts at tests/navigation.test.ts (36 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 36
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```