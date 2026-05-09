---
type: "file"
path: "src/lib/server/agent/tools/analyze-imports.ts"
aliases: ["analyze-imports.ts","src/lib/server/agent/tools/analyze-imports.ts"]
clusterId: 6
ext: ".ts"
lineCount: 333
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/agent/tools/analyze-imports.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/find-files]]","[[Files/analyze-file]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/agent/tools/analyze-imports.ts`
## For future Claude
> Analyze Imports Tool - Real Implementation
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 333
## Summary

Analyze Imports Tool - Real Implementation

## Imports

- imports:: [[Files/find-files]] `./find-files.js`
- imports:: [[Files/analyze-file]] `./analyze-file.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```