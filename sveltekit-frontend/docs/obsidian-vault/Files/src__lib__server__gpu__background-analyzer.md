---
type: "file"
path: "src/lib/server/gpu/background-analyzer.ts"
aliases: ["background-analyzer.ts","src/lib/server/gpu/background-analyzer.ts"]
clusterId: -1
ext: ".ts"
lineCount: 534
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/gpu/background-analyzer.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/libtorch-bridge]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/gpu/background-analyzer.ts`
## For future Claude
> GPU Background Evidence Analyzer
pagerank:: 0.000000
blend:: 0.000000
lines:: 534
## Summary

GPU Background Evidence Analyzer

## Imports

- imports:: [[Files/libtorch-bridge]] `./libtorch-bridge.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```