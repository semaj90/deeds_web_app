---
type: "file"
path: "tests/vector-search-rag.spec.ts"
aliases: ["vector-search-rag.spec.ts","tests/vector-search-rag.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 284
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/tests/vector-search-rag.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/utils__seed-cases]]","[[Files/helpers__env-ports]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/vector-search-rag_spec_ts"]
---

# `tests/vector-search-rag.spec.ts`
## For future Claude
> Vector Search & RAG Pipeline E2E Tests
pagerank:: 0.000000
blend:: 0.000000
lines:: 284
## Summary

Vector Search & RAG Pipeline E2E Tests

## Imports

- imports:: [[Files/utils__seed-cases]] `./utils/seed-cases`
- imports:: [[Files/helpers__env-ports]] `./helpers/env-ports.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```