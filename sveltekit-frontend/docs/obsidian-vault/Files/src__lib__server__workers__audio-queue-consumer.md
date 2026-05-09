---
type: "file"
path: "src/lib/server/workers/audio-queue-consumer.ts"
aliases: ["audio-queue-consumer.ts","src/lib/server/workers/audio-queue-consumer.ts"]
clusterId: 24
ext: ".ts"
lineCount: 55
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/workers/audio-queue-consumer.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-24]]"]
imports: ["[[Files/audio-processor]]"]
tags: ["file","ext/ts","cluster/24","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/workers/audio-queue-consumer.ts`
## For future Claude
> Audio Queue Consumer
cluster:: [[Clusters/cluster-24]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 55
## Summary

Audio Queue Consumer

## Imports

- imports:: [[Files/audio-processor]] `./audio-processor`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```