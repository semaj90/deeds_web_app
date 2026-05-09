---
type: "file"
path: "tests/relationship-extractor.spec.ts"
aliases: ["relationship-extractor.spec.ts","tests/relationship-extractor.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 250
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/tests/relationship-extractor.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/src__lib__server__graph__relationship-extractor]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/relationship-extractor_spec_ts"]
---

# `tests/relationship-extractor.spec.ts`
## For future Claude
> .ts at tests/relationship-extractor.spec.ts (250 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 250
## Imports

- imports:: [[Files/src__lib__server__graph__relationship-extractor]] `../src/lib/server/graph/relationship-extractor.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```