---
type: "file"
path: "src/lib/server/atlas/context-for-file.ts"
aliases: ["context-for-file.ts","src/lib/server/atlas/context-for-file.ts"]
clusterId: 6
ext: ".ts"
lineCount: 469
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/atlas/context-for-file.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/atlas-loader]]","[[Files/types]]","[[Files/prompt-mapper]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/atlas/context-for-file.ts`
## For future Claude
> context-for-file — single entry point that answers
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 469
## Summary

context-for-file — single entry point that answers

## Imports

- imports:: [[Files/atlas-loader]] `./atlas-loader.js`
- imports:: [[Files/types]] `./types.js`
- imports:: [[Files/prompt-mapper]] `./prompt-mapper.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```