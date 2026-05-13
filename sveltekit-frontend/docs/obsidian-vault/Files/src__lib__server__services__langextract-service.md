---
type: "file"
path: "src/lib/server/services/langextract-service.ts"
aliases: ["langextract-service.ts","src/lib/server/services/langextract-service.ts"]
clusterId: -1
ext: ".ts"
lineCount: 588
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/services/langextract-service.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/services/langextract-service.ts`
## For future Claude
> Phase 1: empty LANGEXTRACT_URL = disabled, use TypeScript heuristic directly.
pagerank:: 0.000000
blend:: 0.000000
lines:: 588
## Summary

Phase 1: empty LANGEXTRACT_URL = disabled, use TypeScript heuristic directly.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```