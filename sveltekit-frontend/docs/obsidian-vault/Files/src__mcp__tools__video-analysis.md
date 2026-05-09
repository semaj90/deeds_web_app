---
type: "file"
path: "src/mcp/tools/video-analysis.ts"
aliases: ["video-analysis.ts","src/mcp/tools/video-analysis.ts"]
clusterId: -1
ext: ".ts"
lineCount: 195
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/mcp/tools/video-analysis.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/mcp"]
---

# `src/mcp/tools/video-analysis.ts`
## For future Claude
> Video Analysis Tools for FastMCP
pagerank:: 0.000000
blend:: 0.000000
lines:: 195
## Summary

Video Analysis Tools for FastMCP

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```