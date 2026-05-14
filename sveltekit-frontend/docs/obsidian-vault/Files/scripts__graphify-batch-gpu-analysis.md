---
type: "file"
path: "scripts/graphify-batch-gpu-analysis.mjs"
aliases: ["graphify-batch-gpu-analysis.mjs","scripts/graphify-batch-gpu-analysis.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 946
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/graphify-batch-gpu-analysis.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/graphify-batch-gpu-analysis_mjs"]
---

# `scripts/graphify-batch-gpu-analysis.mjs`
## For future Claude
> graphify-batch-gpu-analysis.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 946
## Summary

graphify-batch-gpu-analysis.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```