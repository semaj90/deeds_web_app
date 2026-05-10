---
type: "file"
path: "src/lib/server/types/retrieval.ts"
aliases: ["retrieval.ts","src/lib/server/types/retrieval.ts"]
clusterId: 73
ext: ".ts"
lineCount: 405
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/types/retrieval.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: []
tags: ["file","ext/ts","cluster/73","t/ts","t/src","t/lib"]
---

# `src/lib/server/types/retrieval.ts`
## For future Claude
> Canonical retrieval result type shared across all knowledge sources.
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 405
## Summary

Canonical retrieval result type shared across all knowledge sources.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```