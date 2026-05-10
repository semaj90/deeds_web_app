---
type: "file"
path: "src/lib/utils/parallaxDynamic.js"
aliases: ["parallaxDynamic.js","src/lib/utils/parallaxDynamic.js"]
clusterId: 1
ext: ".js"
lineCount: 647
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/utils/parallaxDynamic.js"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-1]]"]
imports: []
tags: ["file","ext/js","cluster/1","t/js","t/src","t/lib"]
---

# `src/lib/utils/parallaxDynamic.js`
## For future Claude
> Dynamic Parallax Helper - WebGPU Enhanced
cluster:: [[Clusters/cluster-1]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 647
## Summary

Dynamic Parallax Helper - WebGPU Enhanced

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```