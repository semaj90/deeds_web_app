---
type: "file"
path: "src/lib/server/services/error-analysis/EscalationService.ts"
aliases: ["EscalationService.ts","src/lib/server/services/error-analysis/EscalationService.ts"]
clusterId: -1
ext: ".ts"
lineCount: 408
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/services/error-analysis/EscalationService.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/experiencerecorder]]","[[Files/grpopolicy]]","[[Files/jsonlstorage]]","[[Files/types]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/services/error-analysis/EscalationService.ts`
## For future Claude
> Escalation Service for LLM Self-Improvement System
pagerank:: 0.000000
blend:: 0.000000
lines:: 408
## Summary

Escalation Service for LLM Self-Improvement System

## Imports

- imports:: [[Files/experiencerecorder]] `./ExperienceRecorder.js`
- imports:: [[Files/grpopolicy]] `./GRPOPolicy.js`
- imports:: [[Files/jsonlstorage]] `./JSONLStorage.js`
- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```