---
type: "file"
path: "src/lib/server/analytics/web-research-crawler.test.ts"
aliases: ["web-research-crawler.test.ts","src/lib/server/analytics/web-research-crawler.test.ts"]
clusterId: 60
ext: ".ts"
lineCount: 124
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analytics/web-research-crawler.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-60]]"]
imports: ["[[Files/web-research-crawler]]"]
tags: ["file","ext/ts","cluster/60","test","t/ts","t/src","t/lib"]
---

# `src/lib/server/analytics/web-research-crawler.test.ts`
## For future Claude
> .ts at src/lib/server/analytics/web-research-crawler.test.ts (124 lines).
cluster:: [[Clusters/cluster-60]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 124
## Imports

- imports:: [[Files/web-research-crawler]] `./web-research-crawler.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```