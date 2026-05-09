---
type: "file"
path: "tests/routes/directory-summarizer.test.ts"
aliases: ["directory-summarizer.test.ts","tests/routes/directory-summarizer.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 369
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/routes/directory-summarizer.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","zod","t/ts","t/tests","t/routes"]
---

# `tests/routes/directory-summarizer.test.ts`
## For future Claude
> directory-summarizer.ts — Unit tests for ingestDirectorySummaries
pagerank:: 0.000000
blend:: 0.000000
lines:: 369
## Summary

directory-summarizer.ts — Unit tests for ingestDirectorySummaries

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```