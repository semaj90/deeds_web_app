---
type: "file"
path: "src/lib/server/ai/openai-types.ts"
aliases: ["openai-types.ts","src/lib/server/ai/openai-types.ts"]
clusterId: 19
ext: ".ts"
lineCount: 127
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/openai-types.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: []
tags: ["file","ext/ts","cluster/19","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/openai-types.ts`
## For future Claude
> OpenAI-compatible request/response types + Zod schemas.
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 127
## Summary

OpenAI-compatible request/response types + Zod schemas.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```