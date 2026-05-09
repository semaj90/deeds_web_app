---
type: "file"
path: "tests/e2e/demo-seed.spec.ts"
aliases: ["demo-seed.spec.ts","tests/e2e/demo-seed.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 78
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/e2e/demo-seed.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/fixtures__demo-auth]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/e2e"]
---

# `tests/e2e/demo-seed.spec.ts`
## For future Claude
> Example Playwright test using demo seed data
pagerank:: 0.000000
blend:: 0.000000
lines:: 78
## Summary

Example Playwright test using demo seed data

## Imports

- imports:: [[Files/fixtures__demo-auth]] `../fixtures/demo-auth`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```