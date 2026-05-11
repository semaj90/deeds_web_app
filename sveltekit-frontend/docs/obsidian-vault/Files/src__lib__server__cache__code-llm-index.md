---
type: "file"
path: "src/lib/server/cache/code-llm-index.ts"
aliases: ["code-llm-index.ts","src/lib/server/cache/code-llm-index.ts"]
clusterId: 22
ext: ".ts"
lineCount: 932
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/cache/code-llm-index.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-22]]"]
imports: []
tags: ["file","ext/ts","cluster/22","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/cache/code-llm-index.ts`
## For future Claude
> Code-Path LLM-Output Index — Quick Redis hit-cache for ACE.
cluster:: [[Clusters/cluster-22]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 932
## Summary

Code-Path LLM-Output Index — Quick Redis hit-cache for ACE.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```