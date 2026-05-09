---
type: "file"
path: "tests/routes/codebase-index-summarize-dirs.test.ts"
aliases: ["codebase-index-summarize-dirs.test.ts","tests/routes/codebase-index-summarize-dirs.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 172
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/routes/codebase-index-summarize-dirs.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/helpers__route-test-utils]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/routes"]
---

# `tests/routes/codebase-index-summarize-dirs.test.ts`
## For future Claude
> .ts at tests/routes/codebase-index-summarize-dirs.test.ts (172 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 172
## Imports

- imports:: [[Files/helpers__route-test-utils]] `../helpers/route-test-utils.ts`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```