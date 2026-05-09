---
type: "file"
path: "src/lib/server/inference/adapter-manifest.ts"
aliases: ["adapter-manifest.ts","src/lib/server/inference/adapter-manifest.ts"]
clusterId: 6
ext: ".ts"
lineCount: 107
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/inference/adapter-manifest.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/inference/adapter-manifest.ts`
## For future Claude
> Adapter Manifest — Tracks merged LoRA adapter artifacts
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 107
## Summary

Adapter Manifest — Tracks merged LoRA adapter artifacts

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```