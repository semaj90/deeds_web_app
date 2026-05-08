---
type: "file"
path: "src/lib/server/ace/multi-lane-retrieval.ts"
aliases: ["multi-lane-retrieval.ts","src/lib/server/ace/multi-lane-retrieval.ts"]
clusterId: 6
ext: ".ts"
lineCount: 517
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/multi-lane-retrieval.ts"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/error-fingerprint]]","[[Files/ngram-retrieval]]","[[Files/error-fingerprint]]","[[Files/cache-keys]]","[[Files/cluster-tags-cache]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/multi-lane-retrieval.ts`
## For future Claude
> Lane 7 — glyph_cluster: score every cluster in the latest qdrant_cluster_tags artifact
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 517
## Summary

Lane 7 — glyph_cluster: score every cluster in the latest qdrant_cluster_tags artifact

## Imports

- imports:: [[Files/error-fingerprint]] `./error-fingerprint.js`
- imports:: [[Files/ngram-retrieval]] `./ngram-retrieval.js`
- imports:: [[Files/error-fingerprint]] `./error-fingerprint.js`
- imports:: [[Files/cache-keys]] `./cache-keys.js`
- imports:: [[Files/cluster-tags-cache]] `./cluster-tags-cache.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```