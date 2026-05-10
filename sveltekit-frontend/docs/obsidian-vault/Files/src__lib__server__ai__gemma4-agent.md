---
type: "file"
path: "src/lib/server/ai/gemma4-agent.ts"
aliases: ["gemma4-agent.ts","src/lib/server/ai/gemma4-agent.ts"]
clusterId: 19
ext: ".ts"
lineCount: 2050
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 18
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/gemma4-agent.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: ["[[Files/linter-service]]"]
tags: ["file","ext/ts","cluster/19","auth","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/gemma4-agent.ts`
## For future Claude
> Gemma4 Tool-Calling Agent
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 2050
## Summary

Gemma4 Tool-Calling Agent

## Imports

- imports:: [[Files/linter-service]] `./linter-service.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```