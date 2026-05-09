---
type: "file"
path: "tests/helpers/env-ports.ts"
aliases: ["env-ports.ts","tests/helpers/env-ports.ts"]
clusterId: -1
ext: ".ts"
lineCount: 92
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/tests/helpers/env-ports.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/helpers"]
---

# `tests/helpers/env-ports.ts`
## For future Claude
> Read .env.local or .env from project root
pagerank:: 0.000000
blend:: 0.000000
lines:: 92
## Summary

Read .env.local or .env from project root

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```