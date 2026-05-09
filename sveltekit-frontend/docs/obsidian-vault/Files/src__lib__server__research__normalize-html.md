---
type: "file"
path: "src/lib/server/research/normalize-html.ts"
aliases: ["normalize-html.ts","src/lib/server/research/normalize-html.ts"]
clusterId: 43
ext: ".ts"
lineCount: 31
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/research/normalize-html.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-43]]"]
imports: []
tags: ["file","ext/ts","cluster/43","t/ts","t/src","t/lib"]
---

# `src/lib/server/research/normalize-html.ts`
## For future Claude
> normalize-html.ts — Strip boilerplate and extract clean text/markdown from raw HTML.
cluster:: [[Clusters/cluster-43]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 31
## Summary

normalize-html.ts — Strip boilerplate and extract clean text/markdown from raw HTML.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```