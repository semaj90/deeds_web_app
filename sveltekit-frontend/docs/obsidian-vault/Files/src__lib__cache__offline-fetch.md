---
type: "file"
path: "src/lib/cache/offline-fetch.ts"
aliases: ["offline-fetch.ts","src/lib/cache/offline-fetch.ts"]
clusterId: 94
ext: ".ts"
lineCount: 75
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/cache/offline-fetch.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-94]]"]
imports: []
tags: ["file","ext/ts","cluster/94","t/ts","t/src","t/lib"]
---

# `src/lib/cache/offline-fetch.ts`
## For future Claude
> Offline-aware fetch helper — serves cached data when navigator.onLine is false,
cluster:: [[Clusters/cluster-94]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 75
## Summary

Offline-aware fetch helper — serves cached data when navigator.onLine is false,

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```