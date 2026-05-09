---
type: "file"
path: "src/lib/server/analysis/vlm-evidence-analyzer.ts"
aliases: ["vlm-evidence-analyzer.ts","src/lib/server/analysis/vlm-evidence-analyzer.ts"]
clusterId: 32
ext: ".ts"
lineCount: 362
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analysis/vlm-evidence-analyzer.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: []
tags: ["file","ext/ts","cluster/32","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analysis/vlm-evidence-analyzer.ts`
## For future Claude
> VLM Evidence Analyzer — Server-side image analysis for evidence pipeline
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 362
## Summary

VLM Evidence Analyzer — Server-side image analysis for evidence pipeline

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```