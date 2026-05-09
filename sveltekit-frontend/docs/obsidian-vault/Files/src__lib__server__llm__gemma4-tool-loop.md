---
type: "file"
path: "src/lib/server/llm/gemma4-tool-loop.ts"
aliases: ["gemma4-tool-loop.ts","src/lib/server/llm/gemma4-tool-loop.ts"]
clusterId: 44
ext: ".ts"
lineCount: 665
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/llm/gemma4-tool-loop.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-44]]"]
imports: []
tags: ["file","ext/ts","cluster/44","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/llm/gemma4-tool-loop.ts`
## For future Claude
> Gemma 4 + Ollama Multi-Step Tool-Calling Loop
cluster:: [[Clusters/cluster-44]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 665
## Summary

Gemma 4 + Ollama Multi-Step Tool-Calling Loop

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```