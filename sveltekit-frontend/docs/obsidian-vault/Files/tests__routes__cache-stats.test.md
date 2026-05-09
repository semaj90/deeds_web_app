---
type: "file"
path: "tests/routes/cache-stats.test.ts"
aliases: ["cache-stats.test.ts","tests/routes/cache-stats.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 123
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/routes/cache-stats.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/helpers__route-test-utils]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/routes"]
---

# `tests/routes/cache-stats.test.ts`
## For future Claude
> Unit tests for GET /api/admin/cache-stats
pagerank:: 0.000000
blend:: 0.000000
lines:: 123
## Summary

Unit tests for GET /api/admin/cache-stats

## Imports

- imports:: [[Files/helpers__route-test-utils]] `../helpers/route-test-utils.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```