---
type: "file"
path: "src/lib/machines/document-upload-machine.ts"
aliases: ["document-upload-machine.ts","src/lib/machines/document-upload-machine.ts"]
clusterId: 58
ext: ".ts"
lineCount: 341
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/machines/document-upload-machine.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-58]]"]
imports: []
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/machines/document-upload-machine.ts`
## For future Claude
> .ts at src/lib/machines/document-upload-machine.ts (341 lines).
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 341
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```