---
type: "file"
path: "tests/routes/codebase-index-orchestrate.test.ts"
aliases: ["codebase-index-orchestrate.test.ts","tests/routes/codebase-index-orchestrate.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 645
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/routes/codebase-index-orchestrate.test.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","test","zod","t/ts","t/tests","t/routes"]
---

# `tests/routes/codebase-index-orchestrate.test.ts`
## For future Claude
> .ts at tests/routes/codebase-index-orchestrate.test.ts (645 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 645
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```