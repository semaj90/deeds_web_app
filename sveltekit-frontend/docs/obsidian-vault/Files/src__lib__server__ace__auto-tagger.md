---
type: "file"
path: "src/lib/server/ace/auto-tagger.ts"
aliases: ["auto-tagger.ts","src/lib/server/ace/auto-tagger.ts"]
clusterId: 6
ext: ".ts"
lineCount: 77
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/auto-tagger.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/tag-generator]]","[[Files/tag-sync]]","[[Files/types]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/auto-tagger.ts`
## For future Claude
> Auto-Tagger Pipeline
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 77
## Summary

Auto-Tagger Pipeline

## Imports

- imports:: [[Files/tag-generator]] `./tag-generator.js`
- imports:: [[Files/tag-sync]] `./tag-sync.js`
- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```