---
type: "file"
path: "tests/e2e/chat-rag-sse.spec.ts"
aliases: ["chat-rag-sse.spec.ts","tests/e2e/chat-rag-sse.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 141
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/e2e/chat-rag-sse.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/helpers__env-ports]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/e2e"]
---

# `tests/e2e/chat-rag-sse.spec.ts`
## For future Claude
> Real SSE Chat + RAG Pipeline Test (no mocks)
pagerank:: 0.000000
blend:: 0.000000
lines:: 141
## Summary

Real SSE Chat + RAG Pipeline Test (no mocks)

## Imports

- imports:: [[Files/helpers__env-ports]] `../helpers/env-ports.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```