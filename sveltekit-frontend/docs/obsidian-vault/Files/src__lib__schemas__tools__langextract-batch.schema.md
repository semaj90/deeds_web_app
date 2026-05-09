---
type: "file"
path: "src/lib/schemas/tools/langextract-batch.schema.json"
aliases: ["langextract-batch.schema.json","src/lib/schemas/tools/langextract-batch.schema.json"]
clusterId: 32
ext: ".json"
lineCount: 66
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/schemas/tools/langextract-batch.schema.json"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-32]]"]
imports: []
tags: ["file","ext/json","cluster/32","t/json","t/src","t/lib"]
---

# `src/lib/schemas/tools/langextract-batch.schema.json`
## For future Claude
> .json at src/lib/schemas/tools/langextract-batch.schema.json (66 lines).
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 66
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```