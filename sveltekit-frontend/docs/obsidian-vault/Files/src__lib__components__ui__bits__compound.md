---
type: "file"
path: "src/lib/components/ui/bits/compound.ts"
aliases: ["compound.ts","src/lib/components/ui/bits/compound.ts"]
clusterId: 34
ext: ".ts"
lineCount: 16
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/bits/compound.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-34]]"]
imports: ["[[Files/dialog__index]]","[[Files/card__index]]"]
tags: ["file","ext/ts","cluster/34","t/ts","t/src","t/lib"]
---

# `src/lib/components/ui/bits/compound.ts`
## For future Claude
> .ts at src/lib/components/ui/bits/compound.ts (16 lines).
cluster:: [[Clusters/cluster-34]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 16
## Imports

- imports:: [[Files/dialog__index]] `../dialog/index.js`
- imports:: [[Files/card__index]] `../card/index.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```