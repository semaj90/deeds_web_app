---
type: "file"
path: "src/lib/server/analysis/hmm-section-classifier.ts"
aliases: ["hmm-section-classifier.ts","src/lib/server/analysis/hmm-section-classifier.ts"]
clusterId: 32
ext: ".ts"
lineCount: 197
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analysis/hmm-section-classifier.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: []
tags: ["file","ext/ts","cluster/32","t/ts","t/src","t/lib"]
---

# `src/lib/server/analysis/hmm-section-classifier.ts`
## For future Claude
> HMM Legal Section Classifier — TypeScript port of deeds_labs/services/hmm-topic-service/hmm_legal_model.py
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 197
## Summary

HMM Legal Section Classifier — TypeScript port of deeds_labs/services/hmm-topic-service/hmm_legal_model.py

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```