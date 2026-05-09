---
type: "file"
path: "src/lib/components/evidence/board-history.svelte.ts"
aliases: ["board-history.svelte.ts","src/lib/components/evidence/board-history.svelte.ts"]
clusterId: 86
ext: ".ts"
lineCount: 131
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/board-history.svelte.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-86]]"]
imports: []
tags: ["file","ext/ts","cluster/86","t/ts","t/src","t/lib"]
---

# `src/lib/components/evidence/board-history.svelte.ts`
## For future Claude
> Board History — Command-pattern undo/redo for EvidenceBoard.
cluster:: [[Clusters/cluster-86]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 131
## Summary

Board History — Command-pattern undo/redo for EvidenceBoard.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```