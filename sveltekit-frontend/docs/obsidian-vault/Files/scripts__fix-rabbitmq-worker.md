---
type: "file"
path: "scripts/fix-rabbitmq-worker.cjs"
aliases: ["fix-rabbitmq-worker.cjs","scripts/fix-rabbitmq-worker.cjs"]
clusterId: -1
ext: ".cjs"
lineCount: 578
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/scripts/fix-rabbitmq-worker.cjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/services__rabbitmq-connection]]","[[Files/config__rabbitmq-config]]","[[Files/services__embedding-service]]","[[Files/server__db__unified-client]]","[[Files/server__schema__documents]]","[[Files/server__redis]]"]
tags: ["file","ext/cjs","t/cjs","t/scripts","t/fix-rabbitmq-worker_cjs"]
---

# `scripts/fix-rabbitmq-worker.cjs`
## For future Claude
> RabbitMQ Embedding Worker - Server-side Background Job Processing
pagerank:: 0.000000
blend:: 0.000000
lines:: 578
## Summary

RabbitMQ Embedding Worker - Server-side Background Job Processing

## Imports

- imports:: [[Files/services__rabbitmq-connection]] `../services/rabbitmq-connection.js`
- imports:: [[Files/config__rabbitmq-config]] `../config/rabbitmq-config.js`
- imports:: [[Files/services__embedding-service]] `../services/embedding-service.js`
- imports:: [[Files/server__db__unified-client]] `../server/db/unified-client.js`
- imports:: [[Files/server__schema__documents]] `../server/schema/documents.js`
- imports:: [[Files/server__redis]] `../server/redis.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```