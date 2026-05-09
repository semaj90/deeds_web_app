---
type: "file"
path: "src/lib/server/api-metadata-extractor.ts"
aliases: ["api-metadata-extractor.ts","src/lib/server/api-metadata-extractor.ts"]
clusterId: 6
ext: ".ts"
lineCount: 757
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/api-metadata-extractor.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","auth","t/ts","t/src","t/lib"]
---

# `src/lib/server/api-metadata-extractor.ts`
## For future Claude
> Comprehensive Route Metadata Extractor
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 757
## Summary

Comprehensive Route Metadata Extractor

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```