---
type: "file"
path: "src/workers/kmeans-worker.js"
aliases: ["kmeans-worker.js","src/workers/kmeans-worker.js"]
clusterId: -1
ext: ".js"
lineCount: 26
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/workers/kmeans-worker.js"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/js","t/js","t/src","t/workers"]
---

# `src/workers/kmeans-worker.js`
## For future Claude
> .js at src/workers/kmeans-worker.js (26 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 26
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```