---
type: "file"
path: "src/lib/server/analytics/unified-research-query.ts"
aliases: ["unified-research-query.ts","src/lib/server/analytics/unified-research-query.ts"]
clusterId: 60
ext: ".ts"
lineCount: 680
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analytics/unified-research-query.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-60]]"]
imports: []
tags: ["file","ext/ts","cluster/60","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analytics/unified-research-query.ts`
## For future Claude
> Unified Research Query — Orchestrates all analytics data sources.
cluster:: [[Clusters/cluster-60]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 680
## Summary

Unified Research Query — Orchestrates all analytics data sources.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```