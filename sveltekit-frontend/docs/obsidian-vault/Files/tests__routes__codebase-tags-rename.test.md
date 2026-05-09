---
type: "file"
path: "tests/routes/codebase-tags-rename.test.ts"
aliases: ["codebase-tags-rename.test.ts","tests/routes/codebase-tags-rename.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 138
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/routes/codebase-tags-rename.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/helpers__route-test-utils]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/routes"]
---

# `tests/routes/codebase-tags-rename.test.ts`
## For future Claude
> Unit tests for POST /api/codebase/tags/rename
pagerank:: 0.000000
blend:: 0.000000
lines:: 138
## Summary

Unit tests for POST /api/codebase/tags/rename

## Imports

- imports:: [[Files/helpers__route-test-utils]] `../helpers/route-test-utils.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```