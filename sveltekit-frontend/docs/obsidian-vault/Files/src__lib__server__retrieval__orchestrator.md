---
type: "file"
path: "src/lib/server/retrieval/orchestrator.ts"
aliases: ["orchestrator.ts","src/lib/server/retrieval/orchestrator.ts"]
clusterId: 58
ext: ".ts"
lineCount: 469
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 13
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/orchestrator.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/codebase-context]]","[[Files/graph-context]]","[[Files/graph-informed-retrieval]]","[[Files/authority-chain]]","[[Files/document-dag]]","[[Files/document-dag]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/orchestrator.ts`
## For future Claude
> Retrieval Orchestrator — canonical retrieval pipeline entry point.
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 469
## Summary

Retrieval Orchestrator — canonical retrieval pipeline entry point.

## Imports

- imports:: [[Files/codebase-context]] `./codebase-context.js`
- imports:: [[Files/graph-context]] `./graph-context.js`
- imports:: [[Files/graph-informed-retrieval]] `./graph-informed-retrieval.js`
- imports:: [[Files/authority-chain]] `./authority-chain.js`
- imports:: [[Files/document-dag]] `./document-dag.js`
- imports:: [[Files/document-dag]] `./document-dag.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```