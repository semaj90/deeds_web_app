---
type: "file"
path: "src/lib/server/analysis/entity-extraction.ts"
aliases: ["entity-extraction.ts","src/lib/server/analysis/entity-extraction.ts"]
clusterId: 32
ext: ".ts"
lineCount: 257
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analysis/entity-extraction.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: []
tags: ["file","ext/ts","cluster/32","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/analysis/entity-extraction.ts`
## For future Claude
> Entity extraction: LLM structured extraction (primary) + regex fallback.
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 257
## Summary

Entity extraction: LLM structured extraction (primary) + regex fallback.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```