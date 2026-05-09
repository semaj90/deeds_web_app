---
type: "file"
path: "tests/index.js"
aliases: ["index.js","tests/index.js"]
clusterId: -1
ext: ".js"
lineCount: 5
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/index.js"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/build__debug]]"]
tags: ["file","ext/js","test","t/js","t/tests","t/index_js"]
---

# `tests/index.js`
## For future Claude
> .js at tests/index.js (5 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 5
## Imports

- imports:: [[Files/build__debug]] `../build/debug.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```