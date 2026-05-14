---
type: "file"
path: "scripts/mcp/agent-orchestrator.mjs"
aliases: ["agent-orchestrator.mjs","scripts/mcp/agent-orchestrator.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 611
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/scripts/mcp/agent-orchestrator.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/mcp"]
---

# `scripts/mcp/agent-orchestrator.mjs`
## For future Claude
> Agent Orchestrator - Node.js Edition
pagerank:: 0.000000
blend:: 0.000000
lines:: 611
## Summary

Agent Orchestrator - Node.js Edition

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```