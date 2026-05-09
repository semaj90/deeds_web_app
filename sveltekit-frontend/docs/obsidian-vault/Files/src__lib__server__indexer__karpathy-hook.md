---
type: "file"
path: "src/lib/server/indexer/karpathy-hook.ts"
aliases: ["karpathy-hook.ts","src/lib/server/indexer/karpathy-hook.ts"]
clusterId: 58
ext: ".ts"
lineCount: 210
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/karpathy-hook.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/chunk-id]]","[[Files/karpathy-wiki]]","[[Files/summary-lens-generator]]","[[Files/audit-triage]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/karpathy-hook.ts`
## For future Claude
> Karpathy Hook: The bridge between raw search and structured memory.
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 210
## Summary

Karpathy Hook: The bridge between raw search and structured memory.

## Imports

- imports:: [[Files/chunk-id]] `./chunk-id.js`
- imports:: [[Files/karpathy-wiki]] `./karpathy-wiki.js`
- imports:: [[Files/summary-lens-generator]] `./summary-lens-generator.js`
- imports:: [[Files/audit-triage]] `./audit-triage.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```