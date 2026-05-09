---
type: "file"
path: "src/lib/server/ace/gemma4-codeintel.ts"
aliases: ["gemma4-codeintel.ts","src/lib/server/ace/gemma4-codeintel.ts"]
clusterId: 44
ext: ".ts"
lineCount: 817
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/gemma4-codeintel.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-44]]"]
imports: ["[[Files/codeintel-datastore]]","[[Files/ollama]]","[[Files/ai__hypergraph-store]]","[[Files/grpc__retrieval-client]]"]
tags: ["file","ext/ts","cluster/44","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/gemma4-codeintel.ts`
## For future Claude
> gemma4-codeintel.ts — Gemma4 prompt builder + LLM caller for CodeIntel ACE context.
cluster:: [[Clusters/cluster-44]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 817
## Summary

gemma4-codeintel.ts — Gemma4 prompt builder + LLM caller for CodeIntel ACE context.

## Imports

- imports:: [[Files/codeintel-datastore]] `./codeintel-datastore.js`
- imports:: [[Files/ollama]] `../ollama.js`
- imports:: [[Files/ai__hypergraph-store]] `../ai/hypergraph-store.js`
- imports:: [[Files/grpc__retrieval-client]] `../grpc/retrieval-client.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```