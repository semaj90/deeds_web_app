---
type: "file"
path: "src/lib/server/analytics/web-research-crawler.ts"
aliases: ["web-research-crawler.ts","src/lib/server/analytics/web-research-crawler.ts"]
clusterId: -1
ext: ".ts"
lineCount: 758
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analytics/web-research-crawler.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analytics/web-research-crawler.ts`
## For future Claude
> Web Research Crawler — Search → Summarize → Tag → Cosine Rank → Index
pagerank:: 0.000000
blend:: 0.000000
lines:: 758
## Summary

Web Research Crawler — Search → Summarize → Tag → Cosine Rank → Index

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```