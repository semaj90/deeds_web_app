---
type: "file"
path: "src/lib/stores/index.ts"
aliases: ["index.ts","src/lib/stores/index.ts"]
clusterId: 38
ext: ".ts"
lineCount: 14
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/stores/index.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-38]]"]
imports: []
tags: ["file","ext/ts","cluster/38","t/ts","t/src","t/lib"]
---

# `src/lib/stores/index.ts`
## For future Claude
> Store barrel — re-exports for $lib/stores imports
cluster:: [[Clusters/cluster-38]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 14
## Summary

Store barrel — re-exports for $lib/stores imports

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```