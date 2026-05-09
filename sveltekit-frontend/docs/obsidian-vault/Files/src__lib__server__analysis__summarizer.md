---
type: "file"
path: "src/lib/server/analysis/summarizer.ts"
aliases: ["summarizer.ts","src/lib/server/analysis/summarizer.ts"]
clusterId: 32
ext: ".ts"
lineCount: 48
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analysis/summarizer.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: []
tags: ["file","ext/ts","cluster/32","t/ts","t/src","t/lib"]
---

# `src/lib/server/analysis/summarizer.ts`
## For future Claude
> Legal document summarization via Ollama (gemma4-legal).
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 48
## Summary

Legal document summarization via Ollama (gemma4-legal).

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```