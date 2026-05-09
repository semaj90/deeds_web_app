---
type: "file"
path: "tests/unit/ensure-dev-runtime.test.ts"
aliases: ["ensure-dev-runtime.test.ts","tests/unit/ensure-dev-runtime.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 19
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/tests/unit/ensure-dev-runtime.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/unit"]
---

# `tests/unit/ensure-dev-runtime.test.ts`
## For future Claude
> .ts at tests/unit/ensure-dev-runtime.test.ts (19 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 19
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```