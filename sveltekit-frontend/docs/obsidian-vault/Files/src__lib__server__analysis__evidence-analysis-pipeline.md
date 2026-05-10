---
type: "file"
path: "src/lib/server/analysis/evidence-analysis-pipeline.ts"
aliases: ["evidence-analysis-pipeline.ts","src/lib/server/analysis/evidence-analysis-pipeline.ts"]
clusterId: 32
ext: ".ts"
lineCount: 455
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analysis/evidence-analysis-pipeline.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: []
tags: ["file","ext/ts","cluster/32","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analysis/evidence-analysis-pipeline.ts`
## For future Claude
> Evidence Analysis Pipeline
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 455
## Summary

Evidence Analysis Pipeline

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```