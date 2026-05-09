---
type: "file"
path: "src/lib/server/indexer/pipeline/chunk-stream-pipeline.ts"
aliases: ["chunk-stream-pipeline.ts","src/lib/server/indexer/pipeline/chunk-stream-pipeline.ts"]
clusterId: 58
ext: ".ts"
lineCount: 224
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/pipeline/chunk-stream-pipeline.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/bounded-queue]]","[[Files/batch-writer]]","[[Files/workers__index-worker-pool]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/pipeline/chunk-stream-pipeline.ts`
## For future Claude
> ChunkStreamPipeline — multi-core file indexing pipeline.
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 224
## Summary

ChunkStreamPipeline — multi-core file indexing pipeline.

## Imports

- imports:: [[Files/bounded-queue]] `./bounded-queue.js`
- imports:: [[Files/batch-writer]] `./batch-writer.js`
- imports:: [[Files/workers__index-worker-pool]] `../workers/index-worker-pool.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```