---
type: "file"
path: "src/lib/schemas/tools/scan-repo.schema.json"
aliases: ["scan-repo.schema.json","src/lib/schemas/tools/scan-repo.schema.json"]
clusterId: 29
ext: ".json"
lineCount: 60
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/schemas/tools/scan-repo.schema.json"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-29]]"]
imports: []
tags: ["file","ext/json","cluster/29","t/json","t/src","t/lib"]
---

# `src/lib/schemas/tools/scan-repo.schema.json`
## For future Claude
> .json at src/lib/schemas/tools/scan-repo.schema.json (60 lines).
cluster:: [[Clusters/cluster-29]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 60
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```