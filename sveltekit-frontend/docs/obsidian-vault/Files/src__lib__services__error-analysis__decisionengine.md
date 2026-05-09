---
type: "file"
path: "src/lib/services/error-analysis/DecisionEngine.ts"
aliases: ["DecisionEngine.ts","src/lib/services/error-analysis/DecisionEngine.ts"]
clusterId: 17
ext: ".ts"
lineCount: 370
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/error-analysis/DecisionEngine.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: ["[[Files/types]]","[[Files/toolinvoker]]","[[Files/fixsynthesizer]]","[[Files/experiencerecorder]]","[[Files/grpopolicy]]"]
tags: ["file","ext/ts","cluster/17","t/ts","t/src","t/lib"]
---

# `src/lib/services/error-analysis/DecisionEngine.ts`
## For future Claude
> Decision Engine for LLM Self-Improvement System
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 370
## Summary

Decision Engine for LLM Self-Improvement System

## Imports

- imports:: [[Files/types]] `./types.js`
- imports:: [[Files/toolinvoker]] `./ToolInvoker.js`
- imports:: [[Files/fixsynthesizer]] `./FixSynthesizer.js`
- imports:: [[Files/experiencerecorder]] `./ExperienceRecorder.js`
- imports:: [[Files/grpopolicy]] `./GRPOPolicy.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```