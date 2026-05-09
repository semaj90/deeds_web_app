---
type: "file"
path: "src/lib/server/research/github-search.ts"
aliases: ["github-search.ts","src/lib/server/research/github-search.ts"]
clusterId: 43
ext: ".ts"
lineCount: 34
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/research/github-search.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-43]]"]
imports: ["[[Files/github-harvester]]","[[Files/web-research-ingester]]"]
tags: ["file","ext/ts","cluster/43","t/ts","t/src","t/lib"]
---

# `src/lib/server/research/github-search.ts`
## For future Claude
> github-search.ts — Research subagent wrapper for GitHub search.
cluster:: [[Clusters/cluster-43]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 34
## Summary

github-search.ts — Research subagent wrapper for GitHub search.

## Imports

- imports:: [[Files/github-harvester]] `./github-harvester.js`
- imports:: [[Files/web-research-ingester]] `./web-research-ingester.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```