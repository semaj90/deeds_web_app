---
type: "file"
path: "src/lib/shims/commonjs-shim.js"
aliases: ["commonjs-shim.js","src/lib/shims/commonjs-shim.js"]
clusterId: 57
ext: ".js"
lineCount: 35
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/shims/commonjs-shim.js"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: []
tags: ["file","ext/js","cluster/57","t/js","t/src","t/lib"]
---

# `src/lib/shims/commonjs-shim.js`
## For future Claude
> Lightweight CommonJS compatibility shim for browser builds.
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 35
## Summary

Lightweight CommonJS compatibility shim for browser builds.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```