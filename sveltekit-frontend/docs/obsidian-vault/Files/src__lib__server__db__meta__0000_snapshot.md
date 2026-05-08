---
type: "file"
path: "src/lib/server/db/meta/0000_snapshot.json"
aliases: ["0000_snapshot.json","src/lib/server/db/meta/0000_snapshot.json"]
clusterId: 6
ext: ".json"
lineCount: 2985
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/meta/0000_snapshot.json"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/json","cluster/6","t/json","t/src","t/lib"]
---

# `src/lib/server/db/meta/0000_snapshot.json`
## For future Claude
> .json at src/lib/server/db/meta/0000_snapshot.json (2985 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 2985
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```