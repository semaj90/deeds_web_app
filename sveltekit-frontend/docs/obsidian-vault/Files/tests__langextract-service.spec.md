---
type: "file"
path: "tests/langextract-service.spec.ts"
aliases: ["langextract-service.spec.ts","tests/langextract-service.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 76
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/langextract-service.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/helpers__env-ports]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/langextract-service_spec_ts"]
---

# `tests/langextract-service.spec.ts`
## For future Claude
> .ts at tests/langextract-service.spec.ts (76 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 76
## Imports

- imports:: [[Files/helpers__env-ports]] `./helpers/env-ports.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```