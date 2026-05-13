---
type: "file"
path: "src/lib/server/observability/langfuse.ts"
aliases: ["langfuse.ts","src/lib/server/observability/langfuse.ts"]
clusterId: -1
ext: ".ts"
lineCount: 573
pagerank: 0.273189
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/observability/langfuse.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/observability/langfuse.ts`
## For future Claude
> Langfuse LLM Observability — Trace wrapper for Ollama + Triton inference
pagerank:: 0.273189
blend:: 0.000000
lines:: 573
## Summary

Langfuse LLM Observability — Trace wrapper for Ollama + Triton inference

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```