---
type: "file"
path: "src/lib/server/queue/rabbitmq-manager-fixed.ts"
aliases: ["rabbitmq-manager-fixed.ts","src/lib/server/queue/rabbitmq-manager-fixed.ts"]
clusterId: 6
ext: ".ts"
lineCount: 1963
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/queue/rabbitmq-manager-fixed.ts"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/queue/rabbitmq-manager-fixed.ts`
## For future Claude
> Publish a message, waiting up to `timeoutMs` for RabbitMQ to be fully
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 1963
## Summary

Publish a message, waiting up to `timeoutMs` for RabbitMQ to be fully

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```