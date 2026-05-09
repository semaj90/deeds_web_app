---
type: "file"
path: "tests/routes/codebase-index-enrich-qdrant.test.ts"
aliases: ["codebase-index-enrich-qdrant.test.ts","tests/routes/codebase-index-enrich-qdrant.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 242
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/routes/codebase-index-enrich-qdrant.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/routes"]
---

# `tests/routes/codebase-index-enrich-qdrant.test.ts`
## For future Claude
> Enrich-Qdrant Job Tests
pagerank:: 0.000000
blend:: 0.000000
lines:: 242
## Summary

Enrich-Qdrant Job Tests

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```