---
type: "file"
path: "tests/e2e/homepage-screenshot.spec.ts"
aliases: ["homepage-screenshot.spec.ts","tests/e2e/homepage-screenshot.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 73
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/e2e/homepage-screenshot.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/utils__screenshot-utils]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/e2e"]
---

# `tests/e2e/homepage-screenshot.spec.ts`
## For future Claude
> .ts at tests/e2e/homepage-screenshot.spec.ts (73 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 73
## Imports

- imports:: [[Files/utils__screenshot-utils]] `./utils/screenshot-utils`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```