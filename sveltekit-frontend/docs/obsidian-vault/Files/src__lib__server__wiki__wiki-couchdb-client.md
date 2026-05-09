---
type: "file"
path: "src/lib/server/wiki/wiki-couchdb-client.ts"
aliases: ["wiki-couchdb-client.ts","src/lib/server/wiki/wiki-couchdb-client.ts"]
clusterId: 6
ext: ".ts"
lineCount: 117
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/wiki/wiki-couchdb-client.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/wiki/wiki-couchdb-client.ts`
## For future Claude
> .ts at src/lib/server/wiki/wiki-couchdb-client.ts (117 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 117
## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```