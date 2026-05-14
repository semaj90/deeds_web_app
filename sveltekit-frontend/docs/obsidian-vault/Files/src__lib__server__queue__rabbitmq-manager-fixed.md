---
type: "file"
path: "src/lib/server/queue/rabbitmq-manager-fixed.ts"
aliases: ["rabbitmq-manager-fixed.ts","src/lib/server/queue/rabbitmq-manager-fixed.ts"]
clusterId: -1
ext: ".ts"
lineCount: 2196
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/queue/rabbitmq-manager-fixed.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/queue/rabbitmq-manager-fixed.ts`
## For future Claude
> Publish a message, waiting up to `timeoutMs` for RabbitMQ to be fully
pagerank:: 0.000000
blend:: 0.000000
lines:: 2196
## Summary

Publish a message, waiting up to `timeoutMs` for RabbitMQ to be fully

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```