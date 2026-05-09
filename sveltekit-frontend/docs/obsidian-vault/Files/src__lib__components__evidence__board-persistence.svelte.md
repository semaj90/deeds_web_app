---
type: "file"
path: "src/lib/components/evidence/board-persistence.svelte.ts"
aliases: ["board-persistence.svelte.ts","src/lib/components/evidence/board-persistence.svelte.ts"]
clusterId: 22
ext: ".ts"
lineCount: 232
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/board-persistence.svelte.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-22]]"]
imports: []
tags: ["file","ext/ts","cluster/22","t/ts","t/src","t/lib"]
---

# `src/lib/components/evidence/board-persistence.svelte.ts`
## For future Claude
> Board Persistence — IndexedDB + LokiJS dual-tier for EvidenceBoard.
cluster:: [[Clusters/cluster-22]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 232
## Summary

Board Persistence — IndexedDB + LokiJS dual-tier for EvidenceBoard.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```