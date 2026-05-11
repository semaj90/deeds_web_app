---
type: "file"
path: "tests/retrieval-path-wiring.spec.ts"
aliases: ["retrieval-path-wiring.spec.ts","tests/retrieval-path-wiring.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 608
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/retrieval-path-wiring.spec.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/retrieval-path-wiring_spec_ts"]
---

# `tests/retrieval-path-wiring.spec.ts`
## For future Claude
> Retrieval Path Wiring Tests
pagerank:: 0.000000
blend:: 0.000000
lines:: 608
## Summary

Retrieval Path Wiring Tests

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```