---
type: "file"
path: "src/lib/server/analytics/research-summaries-db.ts"
aliases: ["research-summaries-db.ts","src/lib/server/analytics/research-summaries-db.ts"]
clusterId: 60
ext: ".ts"
lineCount: 472
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analytics/research-summaries-db.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-60]]"]
imports: []
tags: ["file","ext/ts","cluster/60","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analytics/research-summaries-db.ts`
## For future Claude
> research-summaries-db.ts
cluster:: [[Clusters/cluster-60]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 472
## Summary

research-summaries-db.ts

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```