---
type: "file"
path: "src/lib/server/indexer/karpathy-persistence.ts"
aliases: ["karpathy-persistence.ts","src/lib/server/indexer/karpathy-persistence.ts"]
clusterId: 58
ext: ".ts"
lineCount: 195
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/karpathy-persistence.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/vector__qdrant-manager]]","[[Files/neo4j-driver]]","[[Files/karpathy-wiki]]","[[Files/karpathy-hook]]","[[Files/graph__neo4j-gds]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/karpathy-persistence.ts`
## For future Claude
> Karpathy Persistence: Commits the organized artifacts from Karpathy Hook
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 195
## Summary

Karpathy Persistence: Commits the organized artifacts from Karpathy Hook

## Imports

- imports:: [[Files/vector__qdrant-manager]] `../vector/qdrant-manager.js`
- imports:: [[Files/neo4j-driver]] `../neo4j-driver.js`
- imports:: [[Files/karpathy-wiki]] `./karpathy-wiki.js`
- imports:: [[Files/karpathy-hook]] `./karpathy-hook.js`
- imports:: [[Files/graph__neo4j-gds]] `../graph/neo4j-gds.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```