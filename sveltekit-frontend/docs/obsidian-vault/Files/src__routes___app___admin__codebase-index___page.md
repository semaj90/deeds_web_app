---
type: "file"
path: "src/routes/(app)/admin/codebase-index/+page.ts"
aliases: ["+page.ts","src/routes/(app)/admin/codebase-index/+page.ts"]
clusterId: -1
ext: ".ts"
lineCount: 2
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/admin/codebase-index/+page.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","auth","t/ts","t/src","t/routes"]
---

# `src/routes/(app)/admin/codebase-index/+page.ts`
## For future Claude
> .ts at src/routes/(app)/admin/codebase-index/+page.ts (2 lines), auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 2
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```