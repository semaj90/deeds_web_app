---
type: "file"
path: "src/lib/server/phase78/contextBuilder.ts"
aliases: ["contextBuilder.ts","src/lib/server/phase78/contextBuilder.ts"]
clusterId: -1
ext: ".ts"
lineCount: 402
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/phase78/contextBuilder.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/phase78/contextBuilder.ts`
## For future Claude
> Phase 78: RAG + KAG Context Builder
pagerank:: 0.000000
blend:: 0.000000
lines:: 402
## Summary

Phase 78: RAG + KAG Context Builder

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```