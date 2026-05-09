---
type: "file"
path: "src/lib/server/phase72/vectorizeErrors.ts"
aliases: ["vectorizeErrors.ts","src/lib/server/phase72/vectorizeErrors.ts"]
clusterId: 6
ext: ".ts"
lineCount: 31
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/phase72/vectorizeErrors.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/astvectorizer]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/phase72/vectorizeErrors.ts`
## For future Claude
> .ts at src/lib/server/phase72/vectorizeErrors.ts (31 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 31
## Imports

- imports:: [[Files/astvectorizer]] `./astVectorizer.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```