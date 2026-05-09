---
type: "file"
path: "tests/cases-page.spec.ts"
aliases: ["cases-page.spec.ts","tests/cases-page.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 147
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/tests/cases-page.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/fixtures__test-cases]]","[[Files/helpers__env-ports]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/cases-page_spec_ts"]
---

# `tests/cases-page.spec.ts`
## For future Claude
> .ts at tests/cases-page.spec.ts (147 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 147
## Imports

- imports:: [[Files/fixtures__test-cases]] `./fixtures/test-cases.js`
- imports:: [[Files/helpers__env-ports]] `./helpers/env-ports.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```