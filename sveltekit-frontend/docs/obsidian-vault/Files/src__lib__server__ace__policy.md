---
type: "file"
path: "src/lib/server/ace/policy.ts"
aliases: ["policy.ts","src/lib/server/ace/policy.ts"]
clusterId: 72
ext: ".ts"
lineCount: 256
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/policy.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-72]]"]
imports: ["[[Files/types]]","[[Files/types]]"]
tags: ["file","ext/ts","cluster/72","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/policy.ts`
## For future Claude
> .ts at src/lib/server/ace/policy.ts (256 lines).
cluster:: [[Clusters/cluster-72]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 256
## Imports

- imports:: [[Files/types]] `./types.js`
- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```