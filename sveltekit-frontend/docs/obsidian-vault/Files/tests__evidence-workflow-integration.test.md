---
type: "file"
path: "tests/evidence-workflow-integration.test.ts"
aliases: ["evidence-workflow-integration.test.ts","tests/evidence-workflow-integration.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 156
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/tests/evidence-workflow-integration.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/src__lib__machines__evidence-processing-machine]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/evidence-workflow-integration_test_ts"]
---

# `tests/evidence-workflow-integration.test.ts`
## For future Claude
> .ts at tests/evidence-workflow-integration.test.ts (156 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 156
## Imports

- imports:: [[Files/src__lib__machines__evidence-processing-machine]] `../src/lib/machines/evidence-processing-machine`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```