---
type: "file"
path: "src/lib/server/keyword-extractor.ts"
aliases: ["keyword-extractor.ts","src/lib/server/keyword-extractor.ts"]
clusterId: 32
ext: ".ts"
lineCount: 330
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/keyword-extractor.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: ["[[Files/ollama-service]]"]
tags: ["file","ext/ts","cluster/32","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/keyword-extractor.ts`
## For future Claude
> Keyword Extractor Module
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 330
## Summary

Keyword Extractor Module

## Imports

- imports:: [[Files/ollama-service]] `./ollama-service.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```