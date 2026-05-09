---
type: "file"
path: "src/lib/server/analysis/analysis-jobs.ts"
aliases: ["analysis-jobs.ts","src/lib/server/analysis/analysis-jobs.ts"]
clusterId: 39
ext: ".ts"
lineCount: 333
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analysis/analysis-jobs.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-39]]"]
imports: []
tags: ["file","ext/ts","cluster/39","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analysis/analysis-jobs.ts`
## For future Claude
> Drizzle-based analysis job tracking with DB-backed queue.
cluster:: [[Clusters/cluster-39]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 333
## Summary

Drizzle-based analysis job tracking with DB-backed queue.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```