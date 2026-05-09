---
type: "file"
path: "src/lib/server/atlas/prompt-mapper.ts"
aliases: ["prompt-mapper.ts","src/lib/server/atlas/prompt-mapper.ts"]
clusterId: 6
ext: ".ts"
lineCount: 198
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/atlas/prompt-mapper.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/types]]","[[Files/atlas-loader]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/atlas/prompt-mapper.ts`
## For future Claude
> prompt-mapper — turns atlas signals + KAG cache hits into a compact
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 198
## Summary

prompt-mapper — turns atlas signals + KAG cache hits into a compact

## Imports

- imports:: [[Files/types]] `./types.js`
- imports:: [[Files/atlas-loader]] `./atlas-loader.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```