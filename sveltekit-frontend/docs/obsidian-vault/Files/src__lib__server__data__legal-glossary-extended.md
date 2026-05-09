---
type: "file"
path: "src/lib/server/data/legal-glossary-extended.ts"
aliases: ["legal-glossary-extended.ts","src/lib/server/data/legal-glossary-extended.ts"]
clusterId: 6
ext: ".ts"
lineCount: 8
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/data/legal-glossary-extended.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/legal-seed-data]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/data/legal-glossary-extended.ts`
## For future Claude
> .ts at src/lib/server/data/legal-glossary-extended.ts (8 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 8
## Imports

- imports:: [[Files/legal-seed-data]] `./legal-seed-data.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```