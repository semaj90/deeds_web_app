---
type: "file"
path: "tests/fixtures/demo-auth.ts"
aliases: ["demo-auth.ts","tests/fixtures/demo-auth.ts"]
clusterId: -1
ext: ".ts"
lineCount: 45
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: true
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/tests/fixtures/demo-auth.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/fixtures__demo-auth]]"]
tags: ["file","ext/ts","test","auth","t/ts","t/tests","t/fixtures"]
---

# `tests/fixtures/demo-auth.ts`
## For future Claude
> Playwright Auth Fixture
pagerank:: 0.000000
blend:: 0.000000
lines:: 45
## Summary

Playwright Auth Fixture

## Imports

- imports:: [[Files/fixtures__demo-auth]] `../fixtures/demo-auth`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```