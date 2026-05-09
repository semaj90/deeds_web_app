---
type: "file"
path: "src/lib/uno-shortcuts.ts"
aliases: ["uno-shortcuts.ts","src/lib/uno-shortcuts.ts"]
clusterId: 57
ext: ".ts"
lineCount: 4
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/uno-shortcuts.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-57]]"]
imports: []
tags: ["file","ext/ts","cluster/57","t/ts","t/src","t/lib"]
---

# `src/lib/uno-shortcuts.ts`
## For future Claude
> .ts at src/lib/uno-shortcuts.ts (4 lines).
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 4
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```