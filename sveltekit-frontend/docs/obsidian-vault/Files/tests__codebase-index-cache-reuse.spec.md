---
type: "file"
path: "tests/codebase-index-cache-reuse.spec.ts"
aliases: ["codebase-index-cache-reuse.spec.ts","tests/codebase-index-cache-reuse.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 196
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/codebase-index-cache-reuse.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/codebase-index-cache-reuse_spec_ts"]
---

# `tests/codebase-index-cache-reuse.spec.ts`
## For future Claude
> .ts at tests/codebase-index-cache-reuse.spec.ts (196 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 196
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```