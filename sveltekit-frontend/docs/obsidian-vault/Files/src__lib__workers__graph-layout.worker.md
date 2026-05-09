---
type: "file"
path: "src/lib/workers/graph-layout.worker.ts"
aliases: ["graph-layout.worker.ts","src/lib/workers/graph-layout.worker.ts"]
clusterId: 57
ext: ".ts"
lineCount: 125
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/workers/graph-layout.worker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: []
tags: ["file","ext/ts","cluster/57","t/ts","t/src","t/lib"]
---

# `src/lib/workers/graph-layout.worker.ts`
## For future Claude
> graph-layout.worker — Spring-charge force-directed layout.
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 125
## Summary

graph-layout.worker — Spring-charge force-directed layout.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```