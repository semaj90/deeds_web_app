---
type: "file"
path: "sveltekit-frontend/src/mcp/server.ts"
aliases: ["server.ts","sveltekit-frontend/src/mcp/server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 4771
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 12
embedding_id: "qdrant://codebase_chunks_768/sveltekit-frontend/src/mcp/server.ts"
last_updated_by_llm: "2026-05-17T00:47:15.229Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/mcp__index]]","[[Files/tools__repair_tools]]"]
tags: ["file","ext/ts","auth","zod","t/ts","t/sveltekit-frontend","t/src"]
---

# `sveltekit-frontend/src/mcp/server.ts`
## For future Claude
> Setup tool handlers for MCP server
pagerank:: 0.000000
blend:: 0.000000
lines:: 4771
## Summary

Setup tool handlers for MCP server

## Imports

- imports:: [[Files/mcp__index]] `../mcp/index.js`
- imports:: [[Files/tools__repair_tools]] `./tools/repair_tools.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```