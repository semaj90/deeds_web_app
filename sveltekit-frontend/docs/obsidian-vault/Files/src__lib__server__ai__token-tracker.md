---
type: "file"
path: "src/lib/server/ai/token-tracker.ts"
aliases: ["token-tracker.ts","src/lib/server/ai/token-tracker.ts"]
clusterId: 19
ext: ".ts"
lineCount: 201
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/token-tracker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: []
tags: ["file","ext/ts","cluster/19","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/token-tracker.ts`
## For future Claude
> AI Token Usage Tracker — fire-and-forget persistence of LLM token counts.
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 201
## Summary

AI Token Usage Tracker — fire-and-forget persistence of LLM token counts.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```