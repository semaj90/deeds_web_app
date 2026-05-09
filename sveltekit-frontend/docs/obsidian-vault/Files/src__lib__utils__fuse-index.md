---
type: "file"
path: "src/lib/utils/fuse-index.ts"
aliases: ["fuse-index.ts","src/lib/utils/fuse-index.ts"]
clusterId: 1
ext: ".ts"
lineCount: 27
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/utils/fuse-index.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-1]]"]
imports: []
tags: ["file","ext/ts","cluster/1","t/ts","t/src","t/lib"]
---

# `src/lib/utils/fuse-index.ts`
## For future Claude
> .ts at src/lib/utils/fuse-index.ts (27 lines).
cluster:: [[Clusters/cluster-1]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 27
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```