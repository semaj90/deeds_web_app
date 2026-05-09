---
type: "file"
path: "src/lib/server/ace/context-assembler.ts"
aliases: ["context-assembler.ts","src/lib/server/ace/context-assembler.ts"]
clusterId: 72
ext: ".ts"
lineCount: 3628
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 30
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/context-assembler.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-72]]"]
imports: ["[[Files/types]]","[[Files/types]]","[[Files/practice-templates]]","[[Files/style-adapter]]","[[Files/user-analytics-context]]","[[Files/retrieval__cross-encoder-reranker]]","[[Files/retrieval__topological-search]]","[[Files/policy]]"]
tags: ["file","ext/ts","cluster/72","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/context-assembler.ts`
## For future Claude
> ACE Context Assembler — Central Orchestration Module
cluster:: [[Clusters/cluster-72]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 3628
## Summary

ACE Context Assembler — Central Orchestration Module

## Imports

- imports:: [[Files/types]] `./types.js`
- imports:: [[Files/types]] `./types.js`
- imports:: [[Files/practice-templates]] `./practice-templates.js`
- imports:: [[Files/style-adapter]] `./style-adapter.js`
- imports:: [[Files/user-analytics-context]] `./user-analytics-context.js`
- imports:: [[Files/retrieval__cross-encoder-reranker]] `../retrieval/cross-encoder-reranker.js`
- imports:: [[Files/retrieval__topological-search]] `../retrieval/topological-search.js`
- imports:: [[Files/policy]] `./policy.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```