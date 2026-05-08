---
type: "file"
path: "src/mcp/server.ts"
aliases: ["server.ts","src/mcp/server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 4312
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/mcp/server.ts"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/mcp__index]]"]
tags: ["file","ext/ts","auth","zod","t/ts","t/src","t/mcp"]
---

# `src/mcp/server.ts`
## For future Claude
> Setup tool handlers for MCP server
pagerank:: 0.000000
blend:: 0.000000
lines:: 4312
## Summary

Setup tool handlers for MCP server

## Imports

- imports:: [[Files/mcp__index]] `../mcp/index.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```