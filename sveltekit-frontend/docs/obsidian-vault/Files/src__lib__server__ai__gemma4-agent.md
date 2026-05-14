---
type: "file"
path: "src/lib/server/ai/gemma4-agent.ts"
aliases: ["gemma4-agent.ts","src/lib/server/ai/gemma4-agent.ts"]
clusterId: -1
ext: ".ts"
lineCount: 2080
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 20
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/gemma4-agent.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/linter-service]]"]
tags: ["file","ext/ts","auth","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/gemma4-agent.ts`
## For future Claude
> Gemma4 Tool-Calling Agent
pagerank:: 0.000000
blend:: 0.000000
lines:: 2080
## Summary

Gemma4 Tool-Calling Agent

## Imports

- imports:: [[Files/linter-service]] `./linter-service.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```