---
type: "file"
path: "src/lib/server/mcp-bridge.ts"
aliases: ["mcp-bridge.ts","src/lib/server/mcp-bridge.ts"]
clusterId: 6
ext: ".ts"
lineCount: 189
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/mcp-bridge.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/.]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/mcp-bridge.ts`
## For future Claude
> FastMCP In-Process Bridge
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 189
## Summary

FastMCP In-Process Bridge

## Imports

- imports:: [[Files/.]] `../../mcp/index.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```