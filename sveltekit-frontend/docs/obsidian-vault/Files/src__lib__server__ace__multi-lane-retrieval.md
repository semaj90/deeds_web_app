---
type: "file"
path: "src/lib/server/ace/multi-lane-retrieval.ts"
aliases: ["multi-lane-retrieval.ts","src/lib/server/ace/multi-lane-retrieval.ts"]
clusterId: -1
ext: ".ts"
lineCount: 896
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/multi-lane-retrieval.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/error-fingerprint]]","[[Files/ngram-retrieval]]","[[Files/error-fingerprint]]","[[Files/cache-keys]]","[[Files/cluster-tags-cache]]","[[Files/kb__rerank-weight-loader]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/multi-lane-retrieval.ts`
## For future Claude
> Karpathy blend score from Redis gpu:karpathy:scores (added by cartridge enrichment)
pagerank:: 0.000000
blend:: 0.000000
lines:: 896
## Summary

Karpathy blend score from Redis gpu:karpathy:scores (added by cartridge enrichment)

## Imports

- imports:: [[Files/error-fingerprint]] `./error-fingerprint.js`
- imports:: [[Files/ngram-retrieval]] `./ngram-retrieval.js`
- imports:: [[Files/error-fingerprint]] `./error-fingerprint.js`
- imports:: [[Files/cache-keys]] `./cache-keys.js`
- imports:: [[Files/cluster-tags-cache]] `./cluster-tags-cache.js`
- imports:: [[Files/kb__rerank-weight-loader]] `../kb/rerank-weight-loader.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```