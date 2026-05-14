---
type: "file"
path: "scripts/gpu-pipeline-runner.mjs"
aliases: ["gpu-pipeline-runner.mjs","scripts/gpu-pipeline-runner.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 1015
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/scripts/gpu-pipeline-runner.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/gpu-pipeline-runner_mjs"]
---

# `scripts/gpu-pipeline-runner.mjs`
## For future Claude
> Unified GPU Codebase Intelligence Pipeline Runner
pagerank:: 0.000000
blend:: 0.000000
lines:: 1015
## Summary

Unified GPU Codebase Intelligence Pipeline Runner

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```