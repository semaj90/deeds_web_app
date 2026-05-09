---
type: "file"
path: "src/lib/server/ai/lang-extract.ts"
aliases: ["lang-extract.ts","src/lib/server/ai/lang-extract.ts"]
clusterId: 78
ext: ".ts"
lineCount: 350
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/lang-extract.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-78]]"]
imports: []
tags: ["file","ext/ts","cluster/78","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/lang-extract.ts`
## For future Claude
> LangExtract — typed structured extraction from LLM outputs.
cluster:: [[Clusters/cluster-78]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 350
## Summary

LangExtract — typed structured extraction from LLM outputs.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```