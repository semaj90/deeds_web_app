---
type: "file"
path: "tests/sprint3-infrastructure.spec.ts"
aliases: ["sprint3-infrastructure.spec.ts","tests/sprint3-infrastructure.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 182
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/sprint3-infrastructure.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/helpers__env-ports]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/sprint3-infrastructure_spec_ts"]
---

# `tests/sprint3-infrastructure.spec.ts`
## For future Claude
> .ts at tests/sprint3-infrastructure.spec.ts (182 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 182
## Imports

- imports:: [[Files/helpers__env-ports]] `./helpers/env-ports.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```