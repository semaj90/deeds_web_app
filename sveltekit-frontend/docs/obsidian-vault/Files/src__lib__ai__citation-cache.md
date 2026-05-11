---
type: "file"
path: "src/lib/ai/citation-cache.ts"
aliases: ["citation-cache.ts","src/lib/ai/citation-cache.ts"]
clusterId: 14
ext: ".ts"
lineCount: 430
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/ai/citation-cache.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-14]]"]
imports: []
tags: ["file","ext/ts","cluster/14","t/ts","t/src","t/lib"]
---

# `src/lib/ai/citation-cache.ts`
## For future Claude
> Citation Cache — LokiJS + IndexedDB + Fuse.js + Server Fallback
cluster:: [[Clusters/cluster-14]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 430
## Summary

Citation Cache — LokiJS + IndexedDB + Fuse.js + Server Fallback

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```