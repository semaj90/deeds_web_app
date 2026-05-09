---
type: "file"
path: "src/lib/server/db/schema/ace-web-crawl.ts"
aliases: ["ace-web-crawl.ts","src/lib/server/db/schema/ace-web-crawl.ts"]
clusterId: 95
ext: ".ts"
lineCount: 51
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/ace-web-crawl.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-95]]"]
imports: []
tags: ["file","ext/ts","cluster/95","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/ace-web-crawl.ts`
## For future Claude
> ACE Web Crawl Jobs Schema
cluster:: [[Clusters/cluster-95]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 51
## Summary

ACE Web Crawl Jobs Schema

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```