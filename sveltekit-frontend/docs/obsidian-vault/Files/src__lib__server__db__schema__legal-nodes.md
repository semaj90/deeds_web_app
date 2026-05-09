---
type: "file"
path: "src/lib/server/db/schema/legal-nodes.ts"
aliases: ["legal-nodes.ts","src/lib/server/db/schema/legal-nodes.ts"]
clusterId: 53
ext: ".ts"
lineCount: 57
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/legal-nodes.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-53]]"]
imports: ["[[Files/library-documents]]","[[Files/library-document-versions]]"]
tags: ["file","ext/ts","cluster/53","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/legal-nodes.ts`
## For future Claude
> Legal hierarchy nodes — the most important table.
cluster:: [[Clusters/cluster-53]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 57
## Summary

Legal hierarchy nodes — the most important table.

## Imports

- imports:: [[Files/library-documents]] `./library-documents`
- imports:: [[Files/library-document-versions]] `./library-document-versions`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```