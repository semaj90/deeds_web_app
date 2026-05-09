---
type: "file"
path: "tests/routes/codebase-index-export-bundle.test.ts"
aliases: ["codebase-index-export-bundle.test.ts","tests/routes/codebase-index-export-bundle.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 308
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/routes/codebase-index-export-bundle.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/routes"]
---

# `tests/routes/codebase-index-export-bundle.test.ts`
## For future Claude
> Unit tests for GET /api/codebase-index/export/bundle
pagerank:: 0.000000
blend:: 0.000000
lines:: 308
## Summary

Unit tests for GET /api/codebase-index/export/bundle

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```