---
type: "file"
path: "src/lib/server/analytics/deep-research.ts"
aliases: ["deep-research.ts","src/lib/server/analytics/deep-research.ts"]
clusterId: -1
ext: ".ts"
lineCount: 613
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analytics/deep-research.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/search-analytics]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analytics/deep-research.ts`
## For future Claude
> Deep Research — Self-Prompting Research Topic Generator
pagerank:: 0.000000
blend:: 0.000000
lines:: 613
## Summary

Deep Research — Self-Prompting Research Topic Generator

## Imports

- imports:: [[Files/search-analytics]] `./search-analytics.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```