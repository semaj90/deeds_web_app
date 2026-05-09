---
type: "file"
path: "src/lib/server/ff1/planner.ts"
aliases: ["planner.ts","src/lib/server/ff1/planner.ts"]
clusterId: 6
ext: ".ts"
lineCount: 164
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ff1/planner.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/registry]]","[[Files/registry]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ff1/planner.ts`
## For future Claude
> FF1 Compute Planner — server-only.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 164
## Summary

FF1 Compute Planner — server-only.

## Imports

- imports:: [[Files/registry]] `./registry.js`
- imports:: [[Files/registry]] `./registry.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```