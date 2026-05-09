---
type: "file"
path: "src/lib/server/db/schema/reports.ts"
aliases: ["reports.ts","src/lib/server/db/schema/reports.ts"]
clusterId: 53
ext: ".ts"
lineCount: 24
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/reports.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-53]]"]
imports: ["[[Files/legal-cases]]"]
tags: ["file","ext/ts","cluster/53","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/reports.ts`
## For future Claude
> .ts at src/lib/server/db/schema/reports.ts (24 lines).
cluster:: [[Clusters/cluster-53]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 24
## Imports

- imports:: [[Files/legal-cases]] `./legal-cases.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```