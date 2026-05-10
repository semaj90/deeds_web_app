---
type: "file"
path: "src/lib/server/retrieval/auto-backfill.ts"
aliases: ["auto-backfill.ts","src/lib/server/retrieval/auto-backfill.ts"]
clusterId: 58
ext: ".ts"
lineCount: 408
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/auto-backfill.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: []
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/auto-backfill.ts`
## For future Claude
> Auto-Backfill Service — Karpathy LLM Wiki Pattern
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 408
## Summary

Auto-Backfill Service — Karpathy LLM Wiki Pattern

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```