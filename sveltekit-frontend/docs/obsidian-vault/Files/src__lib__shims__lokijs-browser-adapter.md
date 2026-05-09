---
type: "file"
path: "src/lib/shims/lokijs-browser-adapter.js"
aliases: ["lokijs-browser-adapter.js","src/lib/shims/lokijs-browser-adapter.js"]
clusterId: 57
ext: ".js"
lineCount: 163
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/shims/lokijs-browser-adapter.js"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: []
tags: ["file","ext/js","cluster/57","t/js","t/src","t/lib"]
---

# `src/lib/shims/lokijs-browser-adapter.js`
## For future Claude
> LokiJS Browser-Compatible Adapter
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 163
## Summary

LokiJS Browser-Compatible Adapter

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```