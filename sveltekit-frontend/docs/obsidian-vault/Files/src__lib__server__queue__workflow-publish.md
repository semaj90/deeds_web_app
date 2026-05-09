---
type: "file"
path: "src/lib/server/queue/workflow-publish.ts"
aliases: ["workflow-publish.ts","src/lib/server/queue/workflow-publish.ts"]
clusterId: 96
ext: ".ts"
lineCount: 110
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/queue/workflow-publish.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-96]]"]
imports: []
tags: ["file","ext/ts","cluster/96","t/ts","t/src","t/lib"]
---

# `src/lib/server/queue/workflow-publish.ts`
## For future Claude
> Server-side workflow event publisher.
cluster:: [[Clusters/cluster-96]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 110
## Summary

Server-side workflow event publisher.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```