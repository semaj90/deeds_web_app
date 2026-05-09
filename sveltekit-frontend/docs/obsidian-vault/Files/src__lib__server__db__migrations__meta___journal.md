---
type: "file"
path: "src/lib/server/db/migrations/meta/_journal.json"
aliases: ["_journal.json","src/lib/server/db/migrations/meta/_journal.json"]
clusterId: 48
ext: ".json"
lineCount: 77
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/migrations/meta/_journal.json"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-48]]"]
imports: []
tags: ["file","ext/json","cluster/48","t/json","t/src","t/lib"]
---

# `src/lib/server/db/migrations/meta/_journal.json`
## For future Claude
> .json at src/lib/server/db/migrations/meta/_journal.json (77 lines).
cluster:: [[Clusters/cluster-48]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 77
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```