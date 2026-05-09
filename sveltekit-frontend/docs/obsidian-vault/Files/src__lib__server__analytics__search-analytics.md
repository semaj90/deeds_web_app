---
type: "file"
path: "src/lib/server/analytics/search-analytics.ts"
aliases: ["search-analytics.ts","src/lib/server/analytics/search-analytics.ts"]
clusterId: 60
ext: ".ts"
lineCount: 652
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analytics/search-analytics.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-60]]"]
imports: []
tags: ["file","ext/ts","cluster/60","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analytics/search-analytics.ts`
## For future Claude
> Search Analytics — hot-query ring buffer + Bifrost variance pairs + chunk hit recording.
cluster:: [[Clusters/cluster-60]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 652
## Summary

Search Analytics — hot-query ring buffer + Bifrost variance pairs + chunk hit recording.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```