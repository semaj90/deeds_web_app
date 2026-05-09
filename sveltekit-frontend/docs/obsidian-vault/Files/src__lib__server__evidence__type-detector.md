---
type: "file"
path: "src/lib/server/evidence/type-detector.ts"
aliases: ["type-detector.ts","src/lib/server/evidence/type-detector.ts"]
clusterId: 53
ext: ".ts"
lineCount: 166
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/evidence/type-detector.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-53]]"]
imports: []
tags: ["file","ext/ts","cluster/53","t/ts","t/src","t/lib"]
---

# `src/lib/server/evidence/type-detector.ts`
## For future Claude
> Evidence Type Detector — Centralized MIME→evidenceType mapping + post-analysis legal reclassification.
cluster:: [[Clusters/cluster-53]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 166
## Summary

Evidence Type Detector — Centralized MIME→evidenceType mapping + post-analysis legal reclassification.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```