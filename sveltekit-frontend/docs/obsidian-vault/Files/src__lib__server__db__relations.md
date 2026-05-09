---
type: "file"
path: "src/lib/server/db/relations.ts"
aliases: ["relations.ts","src/lib/server/db/relations.ts"]
clusterId: 88
ext: ".ts"
lineCount: 22
pagerank: 0.211856
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/relations.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-88]]"]
imports: ["[[Files/schema-postgres]]"]
tags: ["file","ext/ts","cluster/88","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/relations.ts`
## For future Claude
> .ts at src/lib/server/db/relations.ts (22 lines).
cluster:: [[Clusters/cluster-88]]
pagerank:: 0.211856
blend:: 0.000000
lines:: 22
## Imports

- imports:: [[Files/schema-postgres]] `./schema-postgres.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```