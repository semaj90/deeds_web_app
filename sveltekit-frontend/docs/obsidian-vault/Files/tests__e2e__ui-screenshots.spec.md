---
type: "file"
path: "tests/e2e/ui-screenshots.spec.ts"
aliases: ["ui-screenshots.spec.ts","tests/e2e/ui-screenshots.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 154
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/tests/e2e/ui-screenshots.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/utils__screenshot-utils]]","[[Files/utils__test-fixtures]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/e2e"]
---

# `tests/e2e/ui-screenshots.spec.ts`
## For future Claude
> .ts at tests/e2e/ui-screenshots.spec.ts (154 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 154
## Imports

- imports:: [[Files/utils__screenshot-utils]] `./utils/screenshot-utils`
- imports:: [[Files/utils__test-fixtures]] `./utils/test-fixtures`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```