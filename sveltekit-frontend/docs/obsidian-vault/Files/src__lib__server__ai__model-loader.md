---
type: "file"
path: "src/lib/server/ai/model-loader.ts"
aliases: ["model-loader.ts","src/lib/server/ai/model-loader.ts"]
clusterId: 19
ext: ".ts"
lineCount: 233
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/model-loader.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: []
tags: ["file","ext/ts","cluster/19","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/model-loader.ts`
## For future Claude
> Model Loader — lazy health-check + VRAM-aware backend selection.
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 233
## Summary

Model Loader — lazy health-check + VRAM-aware backend selection.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```