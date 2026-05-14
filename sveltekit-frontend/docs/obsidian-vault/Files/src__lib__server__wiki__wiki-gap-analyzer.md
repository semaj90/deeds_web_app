---
type: "file"
path: "src/lib/server/wiki/wiki-gap-analyzer.ts"
aliases: ["wiki-gap-analyzer.ts","src/lib/server/wiki/wiki-gap-analyzer.ts"]
clusterId: -1
ext: ".ts"
lineCount: 985
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/wiki/wiki-gap-analyzer.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/wiki/wiki-gap-analyzer.ts`
## For future Claude
> .ts at src/lib/server/wiki/wiki-gap-analyzer.ts (985 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 985
## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```