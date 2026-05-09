---
type: "file"
path: "src/lib/server/evidence/audit.ts"
aliases: ["audit.ts","src/lib/server/evidence/audit.ts"]
clusterId: 66
ext: ".ts"
lineCount: 13
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/evidence/audit.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-66]]"]
imports: []
tags: ["file","ext/ts","cluster/66","t/ts","t/src","t/lib"]
---

# `src/lib/server/evidence/audit.ts`
## For future Claude
> Evidence audit helpers — re-exported from the canonical location.
cluster:: [[Clusters/cluster-66]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 13
## Summary

Evidence audit helpers — re-exported from the canonical location.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```