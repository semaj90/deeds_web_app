---
type: "file"
path: "tests/evidence-rag-simple.spec.ts"
aliases: ["evidence-rag-simple.spec.ts","tests/evidence-rag-simple.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 50
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/evidence-rag-simple.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/evidence-rag-simple_spec_ts"]
---

# `tests/evidence-rag-simple.spec.ts`
## For future Claude
> .ts at tests/evidence-rag-simple.spec.ts (50 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 50
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```