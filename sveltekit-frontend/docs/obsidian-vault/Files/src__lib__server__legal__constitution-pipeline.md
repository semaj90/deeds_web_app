---
type: "file"
path: "src/lib/server/legal/constitution-pipeline.ts"
aliases: ["constitution-pipeline.ts","src/lib/server/legal/constitution-pipeline.ts"]
clusterId: 47
ext: ".ts"
lineCount: 628
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 10
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/legal/constitution-pipeline.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-47]]"]
imports: ["[[Files/constitution-fetcher]]","[[Files/html-normalizer]]","[[Files/constitution-tagger]]","[[Files/constitution-registry]]"]
tags: ["file","ext/ts","cluster/47","t/ts","t/src","t/lib"]
---

# `src/lib/server/legal/constitution-pipeline.ts`
## For future Claude
> Constitution Pipeline
cluster:: [[Clusters/cluster-47]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 628
## Summary

Constitution Pipeline

## Imports

- imports:: [[Files/constitution-fetcher]] `./constitution-fetcher`
- imports:: [[Files/html-normalizer]] `./html-normalizer`
- imports:: [[Files/constitution-tagger]] `./constitution-tagger`
- imports:: [[Files/constitution-registry]] `./constitution-registry`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```