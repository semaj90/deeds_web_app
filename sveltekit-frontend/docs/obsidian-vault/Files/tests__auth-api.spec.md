---
type: "file"
path: "tests/auth-api.spec.ts"
aliases: ["auth-api.spec.ts","tests/auth-api.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 215
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: true
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/tests/auth-api.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/fixtures__test-cases]]","[[Files/helpers__env-ports]]"]
tags: ["file","ext/ts","test","auth","t/ts","t/tests","t/auth-api_spec_ts"]
---

# `tests/auth-api.spec.ts`
## For future Claude
> .ts at tests/auth-api.spec.ts (215 lines), auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 215
## Imports

- imports:: [[Files/fixtures__test-cases]] `./fixtures/test-cases.js`
- imports:: [[Files/helpers__env-ports]] `./helpers/env-ports.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```