---
type: "file"
path: "src/lib/utils/sensitive-info-detector.ts"
aliases: ["sensitive-info-detector.ts","src/lib/utils/sensitive-info-detector.ts"]
clusterId: 1
ext: ".ts"
lineCount: 129
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/utils/sensitive-info-detector.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-1]]"]
imports: []
tags: ["file","ext/ts","cluster/1","t/ts","t/src","t/lib"]
---

# `src/lib/utils/sensitive-info-detector.ts`
## For future Claude
> Client-Side Sensitive Information Detector
cluster:: [[Clusters/cluster-1]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 129
## Summary

Client-Side Sensitive Information Detector

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```