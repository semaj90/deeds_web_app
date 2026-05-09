---
type: "file"
path: "src/lib/server/db/schema/case-library-links.ts"
aliases: ["case-library-links.ts","src/lib/server/db/schema/case-library-links.ts"]
clusterId: 53
ext: ".ts"
lineCount: 65
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/case-library-links.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-53]]"]
imports: ["[[Files/legal-cases]]","[[Files/library-documents]]","[[Files/legal-nodes]]"]
tags: ["file","ext/ts","cluster/53","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/case-library-links.ts`
## For future Claude
> Case ↔ Library corpus links.
cluster:: [[Clusters/cluster-53]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 65
## Summary

Case ↔ Library corpus links.

## Imports

- imports:: [[Files/legal-cases]] `./legal-cases`
- imports:: [[Files/library-documents]] `./library-documents`
- imports:: [[Files/legal-nodes]] `./legal-nodes`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```