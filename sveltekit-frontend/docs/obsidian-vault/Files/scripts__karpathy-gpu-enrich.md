---
type: "file"
path: "scripts/karpathy-gpu-enrich.mjs"
aliases: ["karpathy-gpu-enrich.mjs","scripts/karpathy-gpu-enrich.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 962
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/scripts/karpathy-gpu-enrich.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/karpathy-gpu-enrich_mjs"]
---

# `scripts/karpathy-gpu-enrich.mjs`
## For future Claude
> karpathy-gpu-enrich.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 962
## Summary

karpathy-gpu-enrich.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```