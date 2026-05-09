---
type: "file"
path: "tests/scripts/check-user.mjs"
aliases: ["check-user.mjs","tests/scripts/check-user.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 21
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/scripts/check-user.mjs"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/mjs","test","t/mjs","t/tests","t/scripts"]
---

# `tests/scripts/check-user.mjs`
## For future Claude
> .mjs at tests/scripts/check-user.mjs (21 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 21
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```