---
type: "file"
path: "src/lib/server/cache/warm-up.ts"
aliases: ["warm-up.ts","src/lib/server/cache/warm-up.ts"]
clusterId: -1
ext: ".ts"
lineCount: 391
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/cache/warm-up.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/cache/warm-up.ts`
## For future Claude
> Cache Warm-Up Script
pagerank:: 0.000000
blend:: 0.000000
lines:: 391
## Summary

Cache Warm-Up Script

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```