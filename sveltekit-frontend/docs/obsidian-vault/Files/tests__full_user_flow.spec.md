---
type: "file"
path: "tests/full_user_flow.spec.ts"
aliases: ["full_user_flow.spec.ts","tests/full_user_flow.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 140
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/tests/full_user_flow.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/fixtures__test-cases]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/full_user_flow_spec_ts"]
---

# `tests/full_user_flow.spec.ts`
## For future Claude
> .ts at tests/full_user_flow.spec.ts (140 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 140
## Imports

- imports:: [[Files/fixtures__test-cases]] `./fixtures/test-cases.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```