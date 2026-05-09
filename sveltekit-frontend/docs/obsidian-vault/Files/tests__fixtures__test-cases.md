---
type: "file"
path: "tests/fixtures/test-cases.ts"
aliases: ["test-cases.ts","tests/fixtures/test-cases.ts"]
clusterId: -1
ext: ".ts"
lineCount: 44
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/tests/fixtures/test-cases.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/fixtures"]
---

# `tests/fixtures/test-cases.ts`
## For future Claude
> Test case seed data
pagerank:: 0.000000
blend:: 0.000000
lines:: 44
## Summary

Test case seed data

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```