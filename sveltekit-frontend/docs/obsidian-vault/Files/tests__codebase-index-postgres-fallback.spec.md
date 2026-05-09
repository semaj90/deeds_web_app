---
type: "file"
path: "tests/codebase-index-postgres-fallback.spec.ts"
aliases: ["codebase-index-postgres-fallback.spec.ts","tests/codebase-index-postgres-fallback.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 162
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/codebase-index-postgres-fallback.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/codebase-index-postgres-fallback_spec_ts"]
---

# `tests/codebase-index-postgres-fallback.spec.ts`
## For future Claude
> Regression coverage for the PostgreSQL mirror fallback.
pagerank:: 0.000000
blend:: 0.000000
lines:: 162
## Summary

Regression coverage for the PostgreSQL mirror fallback.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```