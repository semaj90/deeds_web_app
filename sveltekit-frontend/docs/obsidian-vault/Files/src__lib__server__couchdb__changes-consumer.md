---
type: "file"
path: "src/lib/server/couchdb/changes-consumer.ts"
aliases: ["changes-consumer.ts","src/lib/server/couchdb/changes-consumer.ts"]
clusterId: 6
ext: ".ts"
lineCount: 168
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/couchdb/changes-consumer.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/mango-indexes]]","[[Files/mango-indexes]]","[[Files/memory-mirror]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/couchdb/changes-consumer.ts`
## For future Claude
> CouchDB _changes feed consumer.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 168
## Summary

CouchDB _changes feed consumer.

## Imports

- imports:: [[Files/mango-indexes]] `./mango-indexes.js`
- imports:: [[Files/mango-indexes]] `./mango-indexes.js`
- imports:: [[Files/memory-mirror]] `./memory-mirror.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```