---
type: "file"
path: "src/lib/server/agents/trace-subagent-orchestrator.ts"
aliases: ["trace-subagent-orchestrator.ts","src/lib/server/agents/trace-subagent-orchestrator.ts"]
clusterId: 6
ext: ".ts"
lineCount: 182
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/agents/trace-subagent-orchestrator.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/ontology-sortation-agent]]","[[Files/memory-encoding-agent]]","[[Files/trace-subagent-registry]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/agents/trace-subagent-orchestrator.ts`
## For future Claude
> TRACE Subagent Orchestrator
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 182
## Summary

TRACE Subagent Orchestrator

## Imports

- imports:: [[Files/ontology-sortation-agent]] `./ontology-sortation-agent.js`
- imports:: [[Files/memory-encoding-agent]] `./memory-encoding-agent.js`
- imports:: [[Files/trace-subagent-registry]] `./trace-subagent-registry.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```