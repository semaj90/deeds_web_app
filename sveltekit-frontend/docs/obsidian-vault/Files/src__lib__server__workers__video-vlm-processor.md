---
type: "file"
path: "src/lib/server/workers/video-vlm-processor.ts"
aliases: ["video-vlm-processor.ts","src/lib/server/workers/video-vlm-processor.ts"]
clusterId: 24
ext: ".ts"
lineCount: 475
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/workers/video-vlm-processor.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-24]]"]
imports: []
tags: ["file","ext/ts","cluster/24","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/workers/video-vlm-processor.ts`
## For future Claude
> Video VLM Processor — Gemma4 Visual Analysis
cluster:: [[Clusters/cluster-24]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 475
## Summary

Video VLM Processor — Gemma4 Visual Analysis

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```