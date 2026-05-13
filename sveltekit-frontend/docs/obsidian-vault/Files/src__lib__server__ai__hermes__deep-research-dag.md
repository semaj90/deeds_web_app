---
type: "file"
path: "src/lib/server/ai/hermes/deep-research-dag.ts"
aliases: ["deep-research-dag.ts","src/lib/server/ai/hermes/deep-research-dag.ts"]
clusterId: -1
ext: ".ts"
lineCount: 942
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 14
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/hermes/deep-research-dag.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/hermes-planner]]","[[Files/inference-configs]]","[[Files/hermes-synth]]","[[Files/langgraph-research]]","[[Files/cuda-graph-manager]]","[[Files/skills__system-audit]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/hermes/deep-research-dag.ts`
## For future Claude
> .ts at src/lib/server/ai/hermes/deep-research-dag.ts (942 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 942
## Imports

- imports:: [[Files/hermes-planner]] `../hermes-planner.js`
- imports:: [[Files/inference-configs]] `../inference-configs.js`
- imports:: [[Files/hermes-synth]] `../hermes-synth.js`
- imports:: [[Files/langgraph-research]] `../langgraph-research.js`
- imports:: [[Files/cuda-graph-manager]] `../cuda-graph-manager.js`
- imports:: [[Files/skills__system-audit]] `./skills/system-audit.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```