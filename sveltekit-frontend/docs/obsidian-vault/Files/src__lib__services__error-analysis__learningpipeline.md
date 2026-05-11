---
type: "file"
path: "src/lib/services/error-analysis/LearningPipeline.ts"
aliases: ["LearningPipeline.ts","src/lib/services/error-analysis/LearningPipeline.ts"]
clusterId: 17
ext: ".ts"
lineCount: 394
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/error-analysis/LearningPipeline.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: ["[[Files/grpopolicy]]","[[Files/experiencerecorder]]","[[Files/patternstorage]]","[[Files/errorclustering]]","[[Files/types]]"]
tags: ["file","ext/ts","cluster/17","t/ts","t/src","t/lib"]
---

# `src/lib/services/error-analysis/LearningPipeline.ts`
## For future Claude
> Learning Pipeline Service for LLM Self-Improvement System
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 394
## Summary

Learning Pipeline Service for LLM Self-Improvement System

## Imports

- imports:: [[Files/grpopolicy]] `./GRPOPolicy.js`
- imports:: [[Files/experiencerecorder]] `./ExperienceRecorder.js`
- imports:: [[Files/patternstorage]] `./PatternStorage.js`
- imports:: [[Files/errorclustering]] `./ErrorClustering.js`
- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```