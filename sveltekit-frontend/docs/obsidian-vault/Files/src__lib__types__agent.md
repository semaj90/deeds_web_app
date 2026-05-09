---
type: "file"
path: "src/lib/types/agent.ts"
aliases: ["agent.ts","src/lib/types/agent.ts"]
clusterId: 0
ext: ".ts"
lineCount: 125
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/types/agent.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-0]]"]
imports: []
tags: ["file","ext/ts","cluster/0","t/ts","t/src","t/lib"]
---

# `src/lib/types/agent.ts`
## For future Claude
> Phase 13: Agentic Tool Calling - Type Definitions
cluster:: [[Clusters/cluster-0]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 125
## Summary

Phase 13: Agentic Tool Calling - Type Definitions

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```