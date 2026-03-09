# YoRHa Legal AI – Comprehensive Guide

This document summarizes the core flows (RAG upload/search, case creation) and AI chat endpoints in this SvelteKit app, with quick tests and troubleshooting.

## RAG: Upload and Search

- Upload endpoint (forms): `POST /api/rag/upload`
- Alternate upload (forms): `POST /api/rag/documents/upload`
- Search endpoint (JSON): `POST /api/rag/search`
- Status: `GET /api/rag/status`
- Documents list/details:
  - `GET /api/rag/documents?limit=50`
  - `GET /api/rag/documents/:id`

Client page: `/rag` supports upload and search. It talks to the endpoints above and shows status and uploaded docs.

### Quick Test

1) Upload a small text file

curl -F file=@README.md -F tags="demo,readme" http://localhost:5173/api/rag/upload

Expected: JSON with documentId, chunks, tags, qdrantStored true (if Qdrant running).

2) Search

curl -X POST http://localhost:5173/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query":"contract breach remedies","searchType":"hybrid","limit":10}'

Expected: success:true with results list (hybrid combines vector + text fallback).

### Services

- Embeddings: Ollama `embeddinggemma:latest` (384-dim) with graceful fallback
- Vector DB: Qdrant `legal_documents` collection (auto-initialized)
- Storage: MinIO bucket `legal-documents` (fallback tolerated in dev)
- Cache: Redis (optional; auth errors tolerated in dev)

## Cases API

- List/search: `GET /api/cases`
  - Query params: `query,status,priority,assignedTo,dateStart,dateEnd,page,limit,useVectorSearch`
- Create: `POST /api/cases` (JSON)
  - Body: `{ title, description?, priority?, status?, incidentDate?, location?, jurisdiction?, caseType? }`
- Update: `PUT /api/cases?id=...`

Client pages use these endpoints across YoRHa detective views. The `/yorha/detective` page includes a “New Case” flow that posts to `/api/cases`.

## AI Chat (Ollama)

Multiple chat endpoints exist for experimentation:

- General chat: `POST /api/ai/chat`
- SSE chat: `POST /api/ai/chat-sse`
- Legal chat: `POST /api/legal/chat`
- Versioned chat: `POST /api/v1/chat` (and others under `/api/v*`)
- Analysis: `POST /api/ai/ollama/analyze-legal-document`

Payloads typically accept `{ messages, model }`. Default model for legal is `gemma3-legal:latest` when applicable. Use the chat UI route `(ai)/chat` if present.

## Known Good Schemas (RAG)

`documents` (enhanced-embedding-schema):
- Required: `filename`, `sourceUri`, `uploadedBy`
- Useful: `title`, `mimeType`, `fileSize`, `extractedText`, `processingStatus`, `metadata`, `processedAt`

`document_chunks`:
- Required: `documentId`, `chunkIndex`, `text`, `embedding`
- Optional: `level`, `tokens`, `metadata`, `confidence`

The upload handlers have been aligned to this schema.

## Troubleshooting

- Drizzle insert errors on `documents`:
  - Ensure fields match enhanced schema (no `uuid`, `originalName`, `minioPath`, etc.).
  - Fixed in `src/routes/api/rag/documents/upload/+server.ts` to use `title, filename, sourceUri, mimeType, fileSize, uploadedBy, ...`.

- Qdrant not running:
  - Upload still succeeds; search falls back to text. Start Qdrant at `http://localhost:6333` for vector results.

- MinIO auth issues in dev:
  - Upload falls back safely; metadata still stored. Configure `MINIO_*` env vars to enable storage.

- Redis NOAUTH/ECONNREFUSED:
  - Endpoints degrade gracefully; caching disabled. Provide `REDIS_URL`/`REDIS_PASSWORD` to enable.

## Handy Endpoints

- Health: `GET /api/rag/status`, `GET /api/search/vector`
- Vector search: `POST /api/search/vector { query, limit }`
- Upload UI: `/rag`
- YoRHa detective: `/yorha/detective`

## Notes

- Route groups like `(legal)` don’t appear in URLs. Use `/cases` not `/(legal)/cases` in links.
- Embedding model dimension is 384. Ensure any pgvector/Qdrant config matches.

