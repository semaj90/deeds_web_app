---
type: "file"
path: "src/lib/components/editor/index.ts"
aliases: ["index.ts","src/lib/components/editor/index.ts"]
clusterId: 92
ext: ".ts"
lineCount: 17
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/editor/index.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/ts","cluster/92","t/ts","t/src","t/lib"]
---

# `src/lib/components/editor/index.ts`
## For future Claude
> Editor Components Export
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 17
## Summary

Editor Components Export

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```