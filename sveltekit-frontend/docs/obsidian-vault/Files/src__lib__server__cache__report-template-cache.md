---
type: "file"
path: "src/lib/server/cache/report-template-cache.ts"
aliases: ["report-template-cache.ts","src/lib/server/cache/report-template-cache.ts"]
clusterId: 22
ext: ".ts"
lineCount: 424
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/cache/report-template-cache.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-22]]"]
imports: []
tags: ["file","ext/ts","cluster/22","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/cache/report-template-cache.ts`
## For future Claude
> Report Template Caching Service
cluster:: [[Clusters/cluster-22]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 424
## Summary

Report Template Caching Service

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```