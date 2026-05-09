---
type: "file"
path: "src/lib/server/ai/gemma4-tool-controller.ts"
aliases: ["gemma4-tool-controller.ts","src/lib/server/ai/gemma4-tool-controller.ts"]
clusterId: 19
ext: ".ts"
lineCount: 365
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/gemma4-tool-controller.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: ["[[Files/mcp-tool-dispatch]]","[[Files/hca-compressor]]"]
tags: ["file","ext/ts","cluster/19","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/gemma4-tool-controller.ts`
## For future Claude
> Gemma4 MCP Tool-Call Controller — Step 5 (TRACE/Karpathy plan).
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 365
## Summary

Gemma4 MCP Tool-Call Controller — Step 5 (TRACE/Karpathy plan).

## Imports

- imports:: [[Files/mcp-tool-dispatch]] `./mcp-tool-dispatch.js`
- imports:: [[Files/hca-compressor]] `./hca-compressor.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```