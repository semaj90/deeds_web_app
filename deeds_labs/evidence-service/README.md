# Evidence Service (ARCHIVED — Reference Implementation)

> **Status**: Archived to `deeds_labs/`. The SvelteKit main stack has superseded this
> standalone microservice. Kept as reference for features not yet ported.

## Why Archived

The SvelteKit app's integrated evidence pipeline (`/api/evidence/upload` + `/api/evidence/search`)
now handles the core upload → OCR → chunk → embed → vector store → graph flow directly,
without requiring a separate GraphQL microservice or additional Docker containers.

---

## Comparison: evidence-service/ vs Current SvelteKit Stack

| Aspect | evidence-service/ (this) | Current SvelteKit stack |
|--------|--------------------------|------------------------|
| **Architecture** | Standalone Node.js microservice (GraphQL) | Integrated SvelteKit API routes |
| **API** | Apollo GraphQL (port 4000) | REST (`/api/evidence/upload`, `/api/evidence/search`) |
| **Upload** | GraphQL `uploadEvidence` mutation | `POST /api/evidence/upload` (FormData) |
| **Queue** | RabbitMQ (4 durable queues, topic exchange) | Inline async (background `processAndEmbed()`) |
| **Workers** | Separate OCR, Embed, Entity, Summarize workers | Single monolithic pipeline in `+server.ts` |
| **OCR** | Tesseract.js only | Hybrid: native Tesseract CLI -> tesseract.js fallback |
| **Chunking** | None (full text) | `legal-chunker.ts` — structure-aware (ARTICLE/SECTION/§) |
| **Embedding** | Ollama HTTP only | gRPC (primary) -> Ollama HTTP (fallback), Redis+memory cache |
| **Vector Storage** | pgvector + Qdrant | pgvector (`evidence_vectors`) + Qdrant (`evidence` collection) |
| **Graph** | None | `yorha_evidence_nodes` + `yorha_evidence_connections` |
| **Entity Extraction** | BERT-NER via transformers.js + regex | Not yet in upload pipeline |
| **Forensics** | PII/SSN/CC pattern detection | Not yet in upload pipeline |
| **Summarization** | Ollama gemma3-legal | Not yet in upload pipeline |
| **Progress** | Redis Pub/Sub -> SSE | In-memory job map -> SSE |
| **MinIO path** | `{caseId}/{evidenceId}/{filename}` | `evidence/{caseId}/{timestamp}-{hex}.{ext}` |
| **Schema** | 5 tables (cases, evidences, embeddings, analysisJobs, caseTimeline) | Shared 70+ table schema |
| **State machine** | XState v5 `caseMachine` | None (procedural pipeline) |
| **LOC** | ~2,775 across 37 files | ~600 across 3-4 files |

### Features in evidence-service/ NOT yet in main stack

1. **Entity extraction** — BERT-NER + regex (emails, phones, SSN, credit cards)
2. **Forensic pattern detection** — PII, legal keywords, date clusters, severity levels
3. **Legal summarization** in upload pipeline — Ollama gemma3-legal per-document
4. **RabbitMQ job queue** — durable, retry-capable, prefetch=1 for GPU control
5. **XState workflow orchestration** — persistent state machine for evidence lifecycle
6. **`analysisJobs` table** — proper async job tracking with status/error/result
7. **`caseTimeline` table** — event chronology per case
8. **Presigned URL generation** — time-limited MinIO download URLs

### Features in main stack NOT in evidence-service/

1. **Structure-aware legal chunking** — headings, citations, section hierarchy
2. **Knowledge graph** — section nodes + edges for document structure
3. **gRPC embedding** with client-side cache (Redis + memory LRU)
4. **Hybrid OCR** — native Tesseract CLI first, JS worker fallback
5. **SHA-256 deduplication** on upload
6. **Graph-hop semantic search** — expand to section siblings, resolve citations

### Recommended Ports to Main Stack

| Feature | Source file(s) | Priority |
|---------|---------------|----------|
| Entity extraction + forensics | `services/entity-extraction.ts`, `services/forensics.ts` | High |
| RabbitMQ worker wiring | `mq/workers/*.ts`, `bootstrap/rabbitmq.ts` | Medium |
| `analysisJobs` table | `db/schema.ts` | Medium |
| Summarization step | `services/summarizer.ts`, `mq/workers/summarizeWorker.ts` | Low |

---

## Tech Stack (Reference)

- **API**: Apollo Server 4.11.0 + GraphQL
- **Database**: PostgreSQL 17 + Drizzle ORM 0.36.4 + pgvector
- **Queue**: RabbitMQ (topic exchange, 4 worker queues)
- **Storage**: MinIO 8.0.1 (S3-compatible)
- **Vector DB**: Qdrant 1.12.0 (768-dim vectors)
- **AI**: Ollama (embeddinggemma + gemma3-legal), Transformers.js (BERT-NER)
- **OCR**: Tesseract.js 5.1.1
- **State**: XState 5.18.2
- **Cache**: Redis + ioredis 5.8.1
- **Logging**: Winston 3.15.0

## Pipeline Flow

```
Upload Evidence -> MinIO Storage -> OCR Queue
                                      |
                              [OCR Worker] (GPU)
                                      |
                              Embedding Queue
                                      |
                    +-------[Embed Worker] (GPU)-------+
                    |                                   |
              Entity Queue                      Summarize Queue
                    |                                   |
           [Entity Worker]                    [Summarize Worker]
                    |                                   |
            PostgreSQL + Qdrant                   PostgreSQL
```

## Database Schema (5 tables)

- **cases** — caseNumber (unique), title, description, status, metadata
- **evidences** — fileName, fileSize, mimeType, storagePath, ocrText, summary, entities, forensicFlags, status
- **embeddings** — vector(768), model, chunkIndex, textSnippet (HNSW cosine index)
- **analysisJobs** — jobType, status, result, error, startedAt/completedAt
- **caseTimeline** — eventType, eventDate, description

## Environment Variables

```bash
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_test
RABBITMQ_URL=amqp://legal_admin:123456@localhost:5672
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123
MINIO_BUCKET=evidence
QDRANT_URL=http://localhost:6333
OLLAMA_BASE_URL=http://localhost:11436
OLLAMA_EMBEDDING_MODEL=embeddinggemma:latest
OLLAMA_CHAT_MODEL=gemma3-legal:latest
PORT=4000
```

## GraphQL API (Reference)

Playground: `http://localhost:4000/graphql`

**Queries**: `case(id)`, `cases(status, limit)`, `evidence(id)`, `evidences(caseId)`, `search(query, caseId, limit)`

**Mutations**: `createCase(input)`, `uploadEvidence(caseId, file)`, `addTimelineEvent(input)`

**Types**: Case, Evidence, Entity, ForensicFlag, SearchResult, TimelineEvent

See `src/graphql/schema.ts` for full type definitions.
