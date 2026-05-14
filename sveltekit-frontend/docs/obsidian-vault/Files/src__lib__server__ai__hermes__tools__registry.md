---
type: "file"
path: "src/lib/server/ai/hermes/tools/registry.ts"
aliases: ["registry.ts","src/lib/server/ai/hermes/tools/registry.ts"]
clusterId: -1
ext: ".ts"
lineCount: 828
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/hermes/tools/registry.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/..__hermes-planner]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/hermes/tools/registry.ts`
## For future Claude
> Hermes Stable Tool Registry
pagerank:: 0.000000
blend:: 0.000000
lines:: 828
## Summary

Hermes Stable Tool Registry

## Imports

- imports:: [[Files/..__hermes-planner]] `../../hermes-planner.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```