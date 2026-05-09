---
type: "file"
path: "src/lib/server/retrieval/authority-chain.ts"
aliases: ["authority-chain.ts","src/lib/server/retrieval/authority-chain.ts"]
clusterId: 58
ext: ".ts"
lineCount: 373
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/authority-chain.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: []
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/authority-chain.ts`
## For future Claude
> Authority Chain Drill-Down (P4: Recursive Multi-Hop Retrieval)
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 373
## Summary

Authority Chain Drill-Down (P4: Recursive Multi-Hop Retrieval)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```