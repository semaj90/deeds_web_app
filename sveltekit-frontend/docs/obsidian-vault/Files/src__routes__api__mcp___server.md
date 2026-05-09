---
type: "file"
path: "src/routes/api/mcp/+server.ts"
aliases: ["+server.ts","src/routes/api/mcp/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 119
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/mcp/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]","[[Files/..__.]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/mcp/+server.ts`
## For future Claude
> Unified HTTP MCP Bridge Gateway
pagerank:: 0.000000
blend:: 0.000000
lines:: 119
## Summary

Unified HTTP MCP Bridge Gateway

## Imports

- imports:: [[Files/_types]] `./$types`
- imports:: [[Files/..__.]] `../../../mcp/server.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```