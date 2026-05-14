---
type: "file"
path: "src/lib/server/agent/tools/web-search.ts"
aliases: ["web-search.ts","src/lib/server/agent/tools/web-search.ts"]
clusterId: -1
ext: ".ts"
lineCount: 455
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/agent/tools/web-search.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/agent/tools/web-search.ts`
## For future Claude
> Web Search Tool - SearXNG + DuckDuckGo Fallback
pagerank:: 0.000000
blend:: 0.000000
lines:: 455
## Summary

Web Search Tool - SearXNG + DuckDuckGo Fallback

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```