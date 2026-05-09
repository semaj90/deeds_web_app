---
type: "file"
path: "src/mcp/server-fastmcp.ts"
aliases: ["server-fastmcp.ts","src/mcp/server-fastmcp.ts"]
clusterId: -1
ext: ".ts"
lineCount: 61
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/mcp/server-fastmcp.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/tools__topology-search]]","[[Files/tools__graph-analysis]]","[[Files/tools__cluster-lenses]]","[[Files/tools__trace-kag]]","[[Files/tools__vault-walker]]"]
tags: ["file","ext/ts","t/ts","t/src","t/mcp"]
---

# `src/mcp/server-fastmcp.ts`
## For future Claude
> server-fastmcp.ts — FastMCP TypeScript codebase intelligence server
pagerank:: 0.000000
blend:: 0.000000
lines:: 61
## Summary

server-fastmcp.ts — FastMCP TypeScript codebase intelligence server

## Imports

- imports:: [[Files/tools__topology-search]] `./tools/topology-search.tool.js`
- imports:: [[Files/tools__graph-analysis]] `./tools/graph-analysis.tool.js`
- imports:: [[Files/tools__cluster-lenses]] `./tools/cluster-lenses.tool.js`
- imports:: [[Files/tools__trace-kag]] `./tools/trace-kag.tool.js`
- imports:: [[Files/tools__vault-walker]] `./tools/vault-walker.tool.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```