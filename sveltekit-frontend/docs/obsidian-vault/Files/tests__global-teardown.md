---
type: "file"
path: "tests/global-teardown.ts"
aliases: ["global-teardown.ts","tests/global-teardown.ts"]
clusterId: -1
ext: ".ts"
lineCount: 50
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/tests/global-teardown.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/fixtures__test-cases]]","[[Files/helpers__env-ports]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/global-teardown_ts"]
---

# `tests/global-teardown.ts`
## For future Claude
> Playwright Global Teardown — deletes seeded test cases after the suite completes.
pagerank:: 0.000000
blend:: 0.000000
lines:: 50
## Summary

Playwright Global Teardown — deletes seeded test cases after the suite completes.

## Imports

- imports:: [[Files/fixtures__test-cases]] `./fixtures/test-cases.js`
- imports:: [[Files/helpers__env-ports]] `./helpers/env-ports.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```