---
type: "file"
path: "src/lib/server/mcp/mcp-internal.ts"
aliases: ["mcp-internal.ts","src/lib/server/mcp/mcp-internal.ts"]
clusterId: 82
ext: ".ts"
lineCount: 63
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/mcp/mcp-internal.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-82]]"]
imports: ["[[Files/..__.]]"]
tags: ["file","ext/ts","cluster/82","t/ts","t/src","t/lib"]
---

# `src/lib/server/mcp/mcp-internal.ts`
## For future Claude
> Internal MCP Bridge
cluster:: [[Clusters/cluster-82]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 63
## Summary

Internal MCP Bridge

## Imports

- imports:: [[Files/..__.]] `../../../mcp/server.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```