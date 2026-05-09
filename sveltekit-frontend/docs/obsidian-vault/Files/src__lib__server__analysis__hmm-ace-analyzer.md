---
type: "file"
path: "src/lib/server/analysis/hmm-ace-analyzer.ts"
aliases: ["hmm-ace-analyzer.ts","src/lib/server/analysis/hmm-ace-analyzer.ts"]
clusterId: 32
ext: ".ts"
lineCount: 394
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analysis/hmm-ace-analyzer.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: ["[[Files/hmm-section-classifier]]"]
tags: ["file","ext/ts","cluster/32","t/ts","t/src","t/lib"]
---

# `src/lib/server/analysis/hmm-ace-analyzer.ts`
## For future Claude
> HMM ACE Analyzer
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 394
## Summary

HMM ACE Analyzer

## Imports

- imports:: [[Files/hmm-section-classifier]] `./hmm-section-classifier.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```