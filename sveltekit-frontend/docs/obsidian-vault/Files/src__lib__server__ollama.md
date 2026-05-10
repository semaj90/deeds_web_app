---
type: "file"
path: "src/lib/server/ollama.ts"
aliases: ["ollama.ts","src/lib/server/ollama.ts"]
clusterId: 6
ext: ".ts"
lineCount: 1372
pagerank: 0.368352
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 11
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ollama.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/ai__hypergraph-store]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ollama.ts`
## For future Claude
> Ollama Integration Service — canonical Ollama client.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.368352
blend:: 0.000000
lines:: 1372
## Summary

Ollama Integration Service — canonical Ollama client.

## Imports

- imports:: [[Files/ai__hypergraph-store]] `./ai/hypergraph-store.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```