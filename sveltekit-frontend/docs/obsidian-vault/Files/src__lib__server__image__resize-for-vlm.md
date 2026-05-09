---
type: "file"
path: "src/lib/server/image/resize-for-vlm.ts"
aliases: ["resize-for-vlm.ts","src/lib/server/image/resize-for-vlm.ts"]
clusterId: 99
ext: ".ts"
lineCount: 88
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/image/resize-for-vlm.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-99]]"]
imports: []
tags: ["file","ext/ts","cluster/99","t/ts","t/src","t/lib"]
---

# `src/lib/server/image/resize-for-vlm.ts`
## For future Claude
> resize-for-vlm.ts
cluster:: [[Clusters/cluster-99]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 88
## Summary

resize-for-vlm.ts

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```