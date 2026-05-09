---
type: "file"
path: "tests/engram-dym.spec.ts"
aliases: ["engram-dym.spec.ts","tests/engram-dym.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 252
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/engram-dym.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/src__lib__server__search__engram-bigram]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/engram-dym_spec_ts"]
---

# `tests/engram-dym.spec.ts`
## For future Claude
> .ts at tests/engram-dym.spec.ts (252 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 252
## Imports

- imports:: [[Files/src__lib__server__search__engram-bigram]] `../src/lib/server/search/engram-bigram.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```