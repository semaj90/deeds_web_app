---
type: "file"
path: "tests/relation-extractor.spec.ts"
aliases: ["relation-extractor.spec.ts","tests/relation-extractor.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 265
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/tests/relation-extractor.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/relation-extractor_spec_ts"]
---

# `tests/relation-extractor.spec.ts`
## For future Claude
> Relation extractor tests — G26 pattern
pagerank:: 0.000000
blend:: 0.000000
lines:: 265
## Summary

Relation extractor tests — G26 pattern

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```