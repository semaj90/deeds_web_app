---
type: "file"
path: "src/lib/server/services/langextract-service.ts"
aliases: ["langextract-service.ts","src/lib/server/services/langextract-service.ts"]
clusterId: 32
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
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: []
tags: ["file","ext/ts","cluster/32","t/ts","t/src","t/lib"]
---

# `src/lib/server/services/langextract-service.ts`
## For future Claude
> Phase 1: empty LANGEXTRACT_URL = disabled, use TypeScript heuristic directly.
cluster:: [[Clusters/cluster-32]]
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