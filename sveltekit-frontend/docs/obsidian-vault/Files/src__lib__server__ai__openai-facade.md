---
type: "file"
path: "src/lib/server/ai/openai-facade.ts"
aliases: ["openai-facade.ts","src/lib/server/ai/openai-facade.ts"]
clusterId: 19
ext: ".ts"
lineCount: 449
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/openai-facade.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: ["[[Files/openai-types]]"]
tags: ["file","ext/ts","cluster/19","auth","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/openai-facade.ts`
## For future Claude
> OpenAI-compatible facade for the YorHA agent stack.
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 449
## Summary

OpenAI-compatible facade for the YorHA agent stack.

## Imports

- imports:: [[Files/openai-types]] `./openai-types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```