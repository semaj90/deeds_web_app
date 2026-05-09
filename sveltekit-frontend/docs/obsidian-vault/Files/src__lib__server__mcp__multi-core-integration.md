---
type: "file"
path: "src/lib/server/mcp/multi-core-integration.ts"
aliases: ["multi-core-integration.ts","src/lib/server/mcp/multi-core-integration.ts"]
clusterId: 82
ext: ".ts"
lineCount: 247
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/mcp/multi-core-integration.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-82]]"]
imports: []
tags: ["file","ext/ts","cluster/82","t/ts","t/src","t/lib"]
---

# `src/lib/server/mcp/multi-core-integration.ts`
## For future Claude
> MCP Multi-Core Server Integration
cluster:: [[Clusters/cluster-82]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 247
## Summary

MCP Multi-Core Server Integration

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```